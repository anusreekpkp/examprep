import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { loginSchema, registerSchema, updateProfileSchema } from './auth.schema.js';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
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

authRouter.post('/refresh', asyncHandler(refreshHandler));

authRouter.post('/logout', asyncHandler(logoutHandler));

authRouter.get('/me', authenticate, asyncHandler(meHandler));

authRouter.patch(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  asyncHandler(updateProfileHandler),
);
