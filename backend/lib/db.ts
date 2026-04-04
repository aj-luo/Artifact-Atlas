import { PrismaClient } from '@prisma/client';

// Append PgBouncer-compatible pool parameters if not already present.
// connection_limit=1 prevents unbounded pool growth per process;
// pool_timeout=20 avoids hung requests under load.
function buildUrl(raw: string): string {
  const u = new URL(raw);
  if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1');
  if (!u.searchParams.has('pool_timeout'))     u.searchParams.set('pool_timeout', '20');
  return u.toString();
}

// Prevent multiple Prisma Client instances in Next.js dev (hot-reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildUrl(process.env.DATABASE_URL!) } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
