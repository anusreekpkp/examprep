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
import { env } from '../../config/env.js';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schema.js';

const REFRESH_TOKEN_TTL_MS = parseDuration(env.REFRESH_TOKEN_EXPIRES_IN);

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: Date;
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
} as const;

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
    select: { ...publicUserSelect, passwordHash: true },
  });

  // Hash even when the user is missing, so response time does not reveal
  // whether an email is registered.
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin',
  );

  if (!user || !passwordMatches) {
    throw ApiError.unauthorized('Incorrect email or password');
  }

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return issueTokens(publicUser, crypto.randomUUID(), context);
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
