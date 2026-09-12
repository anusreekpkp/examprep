import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  parseDuration,
  signAccessToken,
} from '../../utils/tokens.js';
import { OAuth2Client } from 'google-auth-library';
import { appUrl, env, isGoogleEnabled } from '../../config/env.js';
import { passwordResetEmail, sendEmail } from '../../lib/mailer.js';
import type {
  ForgotPasswordInput,
  GoogleSignInInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.schema.js';

const REFRESH_TOKEN_TTL_MS = parseDuration(env.REFRESH_TOKEN_EXPIRES_IN);

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: Date;
  avatarUrl: string | null;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

interface RequestContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  createdAt: true,
  avatarUrl: true,
} as const;

/** How long a reset link stays usable. Short, because email is not private. */
const RESET_TOKEN_TTL_MINUTES = 30;

async function issueTokens(
  user: PublicUser,
  familyId: string,
  context: RequestContext,
): Promise<AuthResult> {
  const { token, tokenHash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: context.userAgent ?? null,
      ipAddress: context.ipAddress ?? null,
    },
  });

  return {
    user,
    accessToken: signAccessToken({ sub: user.id, email: user.email }),
    refreshToken: token,
  };
}

export async function register(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      ...(input.timezone ? { timezone: input.timezone } : {}),
    },
    select: publicUserSelect,
  });

  return issueTokens(user, crypto.randomUUID(), context);
}

export async function login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true, googleId: true },
  });

  // Hash even when the user is missing, so response time does not reveal
  // whether an email is registered.
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin',
  );

  if (!user || !passwordMatches) {
    // An account created through Google has no password to match, so it would
    // otherwise fail here forever with no way to work out why. Naming the
    // method does reveal the address is registered - but the register endpoint
    // already returns 409 for a taken email, so the enumeration door is open
    // regardless, and leaving a student permanently stuck is the worse trade.
    if (user && !user.passwordHash && user.googleId) {
      throw ApiError.unauthorized(
        'This account signs in with Google. Use the Google button, or reset your password to add one.',
      );
    }
    throw ApiError.unauthorized('Incorrect email or password');
  }

  const { passwordHash: _passwordHash, googleId: _googleId, ...publicUser } = user;
  return issueTokens(publicUser, crypto.randomUUID(), context);
}

// ---------------------------------------------------------------- google --

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!isGoogleEnabled) {
    throw ApiError.badRequest('Sign in with Google is not configured on this server');
  }
  googleClient ??= new OAuth2Client(env.GOOGLE_CLIENT_ID as string);
  return googleClient;
}

/**
 * Verifies the ID token the browser received from Google and signs the student
 * in, creating the account on first use.
 *
 * Accounts are matched on Google's `sub`, never on the email address: an email
 * can be reassigned or changed, and trusting it alone would be an account
 * takeover path. The email is only used to link a Google login to an account
 * the same person already made with a password, and only when Google says it
 * has verified that address.
 */
export async function signInWithGoogle(
  input: GoogleSignInInput,
  context: RequestContext,
): Promise<AuthResult> {
  const client = getGoogleClient();

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: input.credential,
      audience: env.GOOGLE_CLIENT_ID as string,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('That Google sign-in could not be verified. Please try again.');
  }

  if (!payload?.sub || !payload.email) {
    throw ApiError.unauthorized('Google did not return enough information to sign you in');
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name?.trim() || email.split('@')[0] || 'Student';
  const avatarUrl = payload.picture ?? null;

  const existingByGoogle = await prisma.user.findUnique({
    where: { googleId },
    select: publicUserSelect,
  });

  if (existingByGoogle) {
    return issueTokens(existingByGoogle, crypto.randomUUID(), context);
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingByEmail) {
    if (!payload.email_verified) {
      // Linking on an unverified address would let anyone who can mint a token
      // for that address take over an existing password account.
      throw ApiError.conflict(
        'An account already uses this email. Sign in with your password instead.',
      );
    }
    const linked = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { googleId, ...(avatarUrl ? { avatarUrl } : {}) },
      select: publicUserSelect,
    });
    return issueTokens(linked, crypto.randomUUID(), context);
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      googleId,
      avatarUrl,
      // No password: this account signs in through Google until it sets one.
      passwordHash: null,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    },
    select: publicUserSelect,
  });

  return issueTokens(created, crypto.randomUUID(), context);
}

// ------------------------------------------------------- password reset --

/**
 * Starts a password reset. Always resolves the same way, whether or not the
 * address exists - the response is the one place this endpoint could be turned
 * into an account-enumeration oracle.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
  context: RequestContext,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true },
  });

  if (!user) return;

  // Any earlier link stops working the moment a new one is asked for.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = generateRefreshToken();

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
      ipAddress: context.ipAddress ?? null,
    },
  });

  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const email = passwordResetEmail(user.name, resetUrl, RESET_TOKEN_TTL_MINUTES);
  await sendEmail({ ...email, to: user.email });
}

/**
 * Completes a reset. Every existing session is revoked: if the reset was
 * prompted by someone else having the password, leaving their refresh tokens
 * alive would make the whole exercise pointless.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashRefreshToken(input.token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!stored || stored.usedAt || stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest(
      'This reset link has expired or has already been used. Request a new one.',
    );
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/**
 * Rotates a refresh token. Presenting a token that was already rotated means
 * either a replay or a stolen cookie, so the entire family is revoked and the
 * student has to log in again on every device.
 */
export async function refresh(rawToken: string, context: RequestContext): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: publicUserSelect } },
  });

  if (!stored) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized('Refresh token reuse detected - please sign in again');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(stored.user, stored.familyId, context);
}

/** Revokes the whole login family so every token from that session dies at once. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    select: { familyId: true },
  });

  if (!stored) return;

  await prisma.refreshToken.updateMany({
    where: { familyId: stored.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw ApiError.notFound('User no longer exists');
  }

  return user;
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: publicUserSelect,
  });
}
