import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { getDashboard } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await getDashboard(requireUser(req).id) });
  }),
);
