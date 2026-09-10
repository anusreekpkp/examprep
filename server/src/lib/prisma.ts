import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isDevelopment } from '../config/env.js';

/**
 * Prisma 7 connects through a driver adapter rather than a bundled query engine,
 * so the Postgres pool is created here and handed to the client.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * tsx watch re-executes this module on every save; without the global cache each
 * reload would open a fresh connection pool and exhaust Neon's connection limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

/** Used by the health endpoint to report real connectivity, not just "process alive". */
export async function checkDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
