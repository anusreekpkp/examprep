import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './mock.service.js';
import {
  createMockSchema,
  updateMockSchema,
  type CreateMockInput,
  type UpdateMockInput,
} from './mock.service.js';

export const mockRouter = Router();

mockRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

mockRouter.get(
  '/exams/:examId/mock-tests',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { mocks: await service.listMocks(requireUser(req).id, req.params.examId as string) });
  }),
);

mockRouter.get(
  '/exams/:examId/mock-tests/analysis',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await service.analyseMocks(requireUser(req).id, req.params.examId as string));
  }),
);

mockRouter.post(
  '/exams/:examId/mock-tests',
  validateBody(createMockSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const mock = await service.createMock(
      requireUser(req).id,
      req.params.examId as string,
      req.body as CreateMockInput,
    );
    ok(res, { mock }, 201);
  }),
);

mockRouter.patch(
  '/mock-tests/:mockId',
  validateBody(updateMockSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const mock = await service.updateMock(
      requireUser(req).id,
      req.params.mockId as string,
      req.body as UpdateMockInput,
    );
    ok(res, { mock });
  }),
);

mockRouter.delete(
  '/mock-tests/:mockId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteMock(requireUser(req).id, req.params.mockId as string);
    ok(res, { deleted: true });
  }),
);
