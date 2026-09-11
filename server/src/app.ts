import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { corsOrigins, isProduction } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { syllabusRouter } from './modules/syllabus/syllabus.routes.js';
import { importRouter } from './modules/import/import.routes.js';
import { revisionRouter } from './modules/revision/revision.routes.js';
import { sessionRouter } from './modules/session/session.routes.js';
import { priorityRouter } from './modules/priority/priority.routes.js';
import { mockRouter } from './modules/mock/mock.routes.js';

export function createApp() {
  const app = express();

  // Render terminates TLS upstream; without this req.secure, req.ip and the
  // rate limiter's client identification are all wrong.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests and curl send no Origin header.
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  // Health stays outside the limiter so Render's probe can never be throttled.
  app.use('/api/health', healthRouter);

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api', syllabusRouter);
  app.use('/api', importRouter);
  app.use('/api', revisionRouter);
  app.use('/api', sessionRouter);
  app.use('/api', priorityRouter);
  app.use('/api', mockRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
