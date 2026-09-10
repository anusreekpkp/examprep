import { Router } from 'express';
import { checkDatabaseConnection } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const healthRouter = Router();

/** Render pings this to decide whether a deploy is live. Must stay dependency-free. */
healthRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'examprep-api',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/** Deeper probe that actually touches Postgres. Not used as the Render health check. */
healthRouter.get(
  '/db',
  asyncHandler(async (_req, res) => {
    const db = await checkDatabaseConnection();
    res.status(db.ok ? 200 : 503).json({
      success: db.ok,
      database: db.ok ? 'connected' : 'unreachable',
      ...(db.error ? { error: db.error } : {}),
    });
  }),
);
