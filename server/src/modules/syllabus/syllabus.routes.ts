import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './syllabus.service.js';
import * as progress from '../progress/progress.service.js';
import {
  createExamSchema,
  createSubjectSchema,
  createTopicSchema,
  reorderSchema,
  updateExamSchema,
  updateSubjectSchema,
  updateTopicSchema,
  updateTopicStatusSchema,
  type CreateExamInput,
  type CreateSubjectInput,
  type CreateTopicInput,
  type ReorderInput,
  type UpdateExamInput,
  type UpdateSubjectInput,
  type UpdateTopicInput,
  type UpdateTopicStatusInput,
} from './syllabus.schema.js';

export const syllabusRouter = Router();

// Every route below is per-student data.
syllabusRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

// -------------------------------------------------------------- templates --

syllabusRouter.get(
  '/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    ok(res, { templates: await service.listTemplates() });
  }),
);

// ------------------------------------------------------------------ exams --

syllabusRouter.get(
  '/exams',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, { exams: await service.listExams(requireUser(req).id) });
  }),
);

syllabusRouter.post(
  '/exams',
  validateBody(createExamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const exam = await service.createExam(requireUser(req).id, req.body as CreateExamInput);
    ok(res, { exam }, 201);
  }),
);

syllabusRouter.get(
  '/exams/:examId',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await service.getExamTree(requireUser(req).id, req.params.examId as string));
  }),
);

syllabusRouter.patch(
  '/exams/:examId',
  validateBody(updateExamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const exam = await service.updateExam(
      requireUser(req).id,
      req.params.examId as string,
      req.body as UpdateExamInput,
    );
    ok(res, { exam });
  }),
);

syllabusRouter.delete(
  '/exams/:examId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteExam(requireUser(req).id, req.params.examId as string);
    ok(res, { deleted: true });
  }),
);

// --------------------------------------------------------------- subjects --

syllabusRouter.post(
  '/exams/:examId/subjects',
  validateBody(createSubjectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const subject = await service.createSubject(
      requireUser(req).id,
      req.params.examId as string,
      req.body as CreateSubjectInput,
    );
    ok(res, { subject }, 201);
  }),
);

syllabusRouter.post(
  '/exams/:examId/subjects/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await service.reorderSubjects(
      requireUser(req).id,
      req.params.examId as string,
      req.body as ReorderInput,
    );
    ok(res, { reordered: true });
  }),
);

syllabusRouter.patch(
  '/subjects/:subjectId',
  validateBody(updateSubjectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const subject = await service.updateSubject(
      requireUser(req).id,
      req.params.subjectId as string,
      req.body as UpdateSubjectInput,
    );
    ok(res, { subject });
  }),
);

syllabusRouter.delete(
  '/subjects/:subjectId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteSubject(requireUser(req).id, req.params.subjectId as string);
    ok(res, { deleted: true });
  }),
);

// ----------------------------------------------------------------- topics --

syllabusRouter.post(
  '/subjects/:subjectId/topics',
  validateBody(createTopicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const topic = await service.createTopic(
      requireUser(req).id,
      req.params.subjectId as string,
      req.body as CreateTopicInput,
    );
    ok(res, { topic }, 201);
  }),
);

syllabusRouter.post(
  '/subjects/:subjectId/topics/reorder',
  validateBody(reorderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await service.reorderTopics(
      requireUser(req).id,
      req.params.subjectId as string,
      req.body as ReorderInput,
    );
    ok(res, { reordered: true });
  }),
);

syllabusRouter.patch(
  '/topics/:topicId',
  validateBody(updateTopicSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const topic = await service.updateTopic(
      requireUser(req).id,
      req.params.topicId as string,
      req.body as UpdateTopicInput,
    );
    ok(res, { topic });
  }),
);

syllabusRouter.get(
  '/exams/:examId/progress',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await progress.getExamProgress(requireUser(req).id, req.params.examId as string));
  }),
);

syllabusRouter.patch(
  '/topics/:topicId/status',
  validateBody(updateTopicStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const topic = await progress.updateTopicStatus(
      requireUser(req).id,
      req.params.topicId as string,
      req.body as UpdateTopicStatusInput,
    );
    ok(res, { topic });
  }),
);

syllabusRouter.delete(
  '/topics/:topicId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteTopic(requireUser(req).id, req.params.topicId as string);
    ok(res, { deleted: true });
  }),
);
