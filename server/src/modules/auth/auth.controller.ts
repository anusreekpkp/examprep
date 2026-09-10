import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { parseDuration } from '../../utils/tokens.js';
import { requireUser } from '../../middleware/authenticate.js';
import * as authService from './auth.service.js';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schema.js';

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
