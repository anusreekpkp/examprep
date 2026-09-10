import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Replaces req.body with the parsed result, so handlers receive the inferred
 * type instead of `any` and unknown keys are stripped before they reach Prisma.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(result.error);
      return;
    }
    Object.assign(req.params, result.data);
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Express 5 exposes req.query via a getter, so mutate rather than reassign.
    Object.assign(req.query, result.data);
    next();
  };
}
