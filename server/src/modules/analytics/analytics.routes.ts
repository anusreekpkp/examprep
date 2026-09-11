import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { studySummary } from './analytics.service.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

analyticsRouter.get(
  '/analytics/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const examId = typeof req.query['examId'] === 'string' ? req.query['examId'] : undefined;
    const raw = Number(req.query['days']);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.trunc(raw))) : 7;
    res.json({
      success: true,
      data: await studySummary(requireUser(req).id, days, examId),
    });
  }),
);
