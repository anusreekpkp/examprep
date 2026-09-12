import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import {
  forgotPasswordSchema,
  googleSignInSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.schema.js';
import {
  authConfigHandler,
  forgotPasswordHandler,
  googleHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
  updateProfileHandler,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(registerHandler),
);

authRouter.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(loginHandler));

authRouter.get('/config', authConfigHandler);

authRouter.post(
  '/google',
  authLimiter,
  validateBody(googleSignInSchema),
  asyncHandler(googleHandler),
);

// Throttled like the other credential routes: without it this is a free
// email-sending endpoint pointed at any address someone types.
authRouter.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(forgotPasswordHandler),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(resetPasswordHandler),
);

authRouter.post('/refresh', asyncHandler(refreshHandler));

authRouter.post('/logout', asyncHandler(logoutHandler));

authRouter.get('/me', authenticate, asyncHandler(meHandler));

authRouter.patch(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  asyncHandler(updateProfileHandler),
);
