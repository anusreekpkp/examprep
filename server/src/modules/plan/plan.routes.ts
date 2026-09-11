import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './plan.service.js';
import {
  generatePlanSchema,
  updatePlanItemSchema,
  type GeneratePlanInput,
  type UpdatePlanItemInput,
} from './plan.service.js';

export const planRouter = Router();

planRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

planRouter.get(
  '/exams/:examId/plan',
  asyncHandler(async (req: Request, res: Response) => {
    const date = typeof req.query['date'] === 'string' ? req.query['date'] : undefined;
    ok(res, await service.getPlan(requireUser(req).id, req.params.examId as string, date));
  }),
);

planRouter.post(
  '/exams/:examId/plan',
  validateBody(generatePlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.generatePlan(
      requireUser(req).id,
      req.params.examId as string,
      req.body as GeneratePlanInput,
    );
    ok(res, result, 201);
  }),
);

planRouter.patch(
  '/plan-items/:itemId',
  validateBody(updatePlanItemSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await service.updatePlanItem(
      requireUser(req).id,
      req.params.itemId as string,
      req.body as UpdatePlanItemInput,
    );
    ok(res, { item });
  }),
);

planRouter.delete(
  '/plans/:planId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deletePlan(requireUser(req).id, req.params.planId as string);
    ok(res, { deleted: true });
  }),
);
