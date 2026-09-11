import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import * as service from './note.service.js';
import {
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from './note.service.js';

export const noteRouter = Router();

noteRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

noteRouter.get(
  '/topics/:topicId/notes',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, {
      notes: await service.listTopicNotes(requireUser(req).id, req.params.topicId as string),
    });
  }),
);

noteRouter.post(
  '/topics/:topicId/notes',
  validateBody(createNoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const note = await service.createNote(
      requireUser(req).id,
      req.params.topicId as string,
      req.body as CreateNoteInput,
    );
    ok(res, { note }, 201);
  }),
);

noteRouter.get(
  '/exams/:examId/notes',
  asyncHandler(async (req: Request, res: Response) => {
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    const userId = requireUser(req).id;
    const examId = req.params.examId as string;
    const [notes, counts] = await Promise.all([
      service.listExamNotes(userId, examId, search),
      service.noteCountsByTopic(userId, examId),
    ]);
    ok(res, { notes, countsByTopic: counts });
  }),
);

noteRouter.patch(
  '/notes/:noteId',
  validateBody(updateNoteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const note = await service.updateNote(
      requireUser(req).id,
      req.params.noteId as string,
      req.body as UpdateNoteInput,
    );
    ok(res, { note });
  }),
);

noteRouter.delete(
  '/notes/:noteId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteNote(requireUser(req).id, req.params.noteId as string);
    ok(res, { deleted: true });
  }),
);
