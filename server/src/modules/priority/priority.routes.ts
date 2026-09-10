import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { rankTopics } from './priority.service.js';
import { COMPONENT_MAX, RECENCY_PENALTY_MAX } from './priorityScore.js';

export const priorityRouter = Router();

priorityRouter.use(authenticate);

priorityRouter.get(
  '/priorities',
  asyncHandler(async (req: Request, res: Response) => {
    const examId = typeof req.query['examId'] === 'string' ? req.query['examId'] : undefined;
    const raw = Number(req.query['limit']);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 20;

    const result = await rankTopics(requireUser(req).id, { examId, limit });
    res.json({
      success: true,
      data: {
        ...result,
        // Shipped with the ranking so the UI can draw the breakdown to scale
        // without hard-coding the weights in two places.
        weights: { components: COMPONENT_MAX, recencyPenaltyMax: RECENCY_PENALTY_MAX },
      },
    });
  }),
);
