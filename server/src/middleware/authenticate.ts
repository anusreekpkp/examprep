import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Guards a route with a bearer access token. Deliberately does not hit the
 * database — that is the point of a stateless access token — so a deleted
 * user stays usable until their short-lived token expires.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Missing bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(ApiError.unauthorized('Missing bearer token'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrows `req.user` for handlers that run behind `authenticate`. */
export function requireUser(req: Request): { id: string; email: string } {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user;
}
