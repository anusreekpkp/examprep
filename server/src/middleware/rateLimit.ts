import rateLimit from 'express-rate-limit';
import { isProduction } from '../config/env.js';

/**
 * Credential endpoints are the ones worth throttling: without this, the login
 * route is an open password-guessing oracle. Limits are relaxed outside
 * production so development and manual testing do not trip them.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 10 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please try again in a few minutes.',
  },
});

/** Broad ceiling for everything else, mostly to blunt accidental request loops. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProduction ? 120 : 10_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});
