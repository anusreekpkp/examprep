import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './session.service.js';
import {
  finishSessionSchema,
  startSessionSchema,
  type FinishSessionInput,
  type StartSessionInput,
} from './session.service.js';

export const sessionRouter = Router();

sessionRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

/** Lets a reloaded tab pick a running session back up instead of losing it. */
sessionRouter.get(
  '/sessions/active',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await service.getActiveSession(requireUser(req).id));
  }),
);

sessionRouter.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const examId = typeof req.query['examId'] === 'string' ? req.query['examId'] : undefined;
    const raw = Number(req.query['limit']);
    const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 30;
    ok(res, await service.listSessions(requireUser(req).id, examId, limit));
  }),
);

sessionRouter.get(
  '/sessions/daily',
  asyncHandler(async (req: Request, res: Response) => {
    const raw = Number(req.query['days']);
    const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.trunc(raw))) : 7;
    ok(res, await service.dailyTotals(requireUser(req).id, days));
  }),
);

sessionRouter.post(
  '/sessions',
  validateBody(startSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const session = await service.startSession(
      requireUser(req).id,
      req.body as StartSessionInput,
    );
    ok(res, { session }, 201);
  }),
);

sessionRouter.post(
  '/sessions/:sessionId/finish',
  validateBody(finishSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.finishSession(
      requireUser(req).id,
      req.params.sessionId as string,
      req.body as FinishSessionInput,
    );
    ok(res, result);
  }),
);

sessionRouter.delete(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.cancelSession(requireUser(req).id, req.params.sessionId as string);
    ok(res, { discarded: true });
  }),
);
