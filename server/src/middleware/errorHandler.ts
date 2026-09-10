import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { isProduction } from '../config/env.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Zod failures are user input problems, not server faults.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than the 10 MB limit'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Upload one file at a time'
          : `Upload failed: ${err.message}`;
    res.status(400).json({ success: false, message });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  console.error('[unhandled]', error.stack ?? error.message);

  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    ...(isProduction ? {} : { debug: error.message }),
  });
}
