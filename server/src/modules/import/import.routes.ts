import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from './extract.js';
import * as service from './import.service.js';
import { applyImportSchema, type ApplyImportInput } from './import.service.js';

/**
 * memoryStorage, not diskStorage: Render's free filesystem is recreated on every
 * deploy, so a saved upload would vanish. The buffer is parsed and dropped; only
 * the extracted text is persisted.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if ((ACCEPTED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(ApiError.badRequest(`Upload a PDF or an image. Received "${file.mimetype}".`));
  },
});

export const importRouter = Router();

importRouter.use(authenticate);

const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

importRouter.post(
  '/exams/:examId/syllabus-imports',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw ApiError.badRequest('Attach a syllabus file to upload');

    const result = await service.importSyllabus(
      requireUser(req).id,
      req.params.examId as string,
      req.file,
    );
    ok(res, result, 201);
  }),
);

importRouter.get(
  '/exams/:examId/syllabus-imports',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, {
      imports: await service.listImports(requireUser(req).id, req.params.examId as string),
    });
  }),
);

importRouter.get(
  '/syllabus-imports/:importId',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, {
      import: await service.getImportText(requireUser(req).id, req.params.importId as string),
    });
  }),
);

importRouter.post(
  '/syllabus-imports/:importId/apply',
  validateBody(applyImportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await service.applyImport(
      requireUser(req).id,
      req.params.importId as string,
      req.body as ApplyImportInput,
    );
    ok(res, result);
  }),
);

importRouter.delete(
  '/syllabus-imports/:importId',
  asyncHandler(async (req: Request, res: Response) => {
    await service.deleteImport(requireUser(req).id, req.params.importId as string);
    ok(res, { deleted: true });
  }),
);
