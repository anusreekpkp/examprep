import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 no longer reads the connection URL from schema.prisma and no longer
 * auto-loads .env, so both live here. Only the CLI (migrate, studio, db) uses
 * this file — the running server connects through the pg adapter in lib/prisma.ts.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
