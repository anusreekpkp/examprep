import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './revision.service.js';
import { completeRevisionSchema, type CompleteRevisionInput } from './revision.service.js';

export const revisionRouter = Router();

revisionRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

/** Due today or overdue, across every exam unless one is named. */
revisionRouter.get(
  '/revisions/due',
  asyncHandler(async (req: Request, res: Response) => {
    const examId = typeof req.query['examId'] === 'string' ? req.query['examId'] : undefined;
    ok(res, await service.listDue(requireUser(req).id, examId));
  }),
);

revisionRouter.get(
  '/exams/:examId/revisions/upcoming',
  asyncHandler(async (req: Request, res: Response) => {
    const raw = Number(req.query['days']);
    // Clamped rather than validated away: a silly ?days= should not 400.
    const days = Number.isFinite(raw) ? Math.min(60, Math.max(1, Math.trunc(raw))) : 14;
    ok(res, await service.listUpcoming(requireUser(req).id, req.params.examId as string, days));
  }),
);

revisionRouter.post(
  '/revisions/:revisionId/complete',
  validateBody(completeRevisionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.completeRevision(
      requireUser(req).id,
      req.params.revisionId as string,
      req.body as CompleteRevisionInput,
    );
    ok(res, result);
  }),
);

revisionRouter.post(
  '/revisions/:revisionId/skip',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await service.skipRevision(requireUser(req).id, req.params.revisionId as string));
  }),
);
