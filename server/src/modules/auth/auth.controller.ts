import type { CookieOptions, Request, Response } from 'express';
import { env, isGoogleEnabled, isProduction } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDuration } from '../../utils/tokens.js';
import { requireUser } from '../../middleware/authenticate.js';
import * as authService from './auth.service.js';
import type {
  ForgotPasswordInput,
  GoogleSignInInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.schema.js';

export const REFRESH_COOKIE = 'examprep_refresh';

/**
 * The refresh token lives in an httpOnly cookie so page JavaScript cannot read
 * it; the access token is returned in the body and kept in memory by the client.
 * In production the API and the web app are separate onrender.com hosts, which
 * counts as cross-site, so the cookie needs SameSite=None and Secure.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: parseDuration(env.REFRESH_TOKEN_EXPIRES_IN),
  };
}

function sendAuthResult(res: Response, result: authService.AuthResult, status = 200) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
  res.status(status).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
}

function contextFrom(req: Request) {
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ipAddress: req.ip,
  };
}

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register(req.body as RegisterInput, contextFrom(req));
  sendAuthResult(res, result, 201);
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body as LoginInput, contextFrom(req));
  sendAuthResult(res, result);
}

/** Lets the sign-in page decide whether to render the Google button. */
export function authConfigHandler(_req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      googleEnabled: isGoogleEnabled,
      googleClientId: isGoogleEnabled ? env.GOOGLE_CLIENT_ID : null,
    },
  });
}

export async function googleHandler(req: Request, res: Response) {
  const result = await authService.signInWithGoogle(
    req.body as GoogleSignInInput,
    contextFrom(req),
  );
  sendAuthResult(res, result);
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  await authService.requestPasswordReset(req.body as ForgotPasswordInput, contextFrom(req));
  // Deliberately identical whether or not the address exists.
  res.json({
    success: true,
    message: 'If that email has an account, a reset link is on its way.',
  });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  await authService.resetPassword(req.body as ResetPasswordInput);
  res.json({ success: true, message: 'Your password has been changed. Sign in with it now.' });
}

export async function refreshHandler(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) {
    throw ApiError.unauthorized('No refresh token provided');
  }
  const result = await authService.refresh(token, contextFrom(req));
  sendAuthResult(res, result);
}

export async function logoutHandler(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  // Clearing must repeat the attributes the cookie was set with, or the browser
  // keeps the original.
  const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  res.json({ success: true, message: 'Signed out' });
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.getProfile(requireUser(req).id);
  res.json({ success: true, data: { user } });
}

export async function updateProfileHandler(req: Request, res: Response) {
  const user = await authService.updateProfile(
    requireUser(req).id,
    req.body as UpdateProfileInput,
  );
  res.json({ success: true, data: { user } });
}
