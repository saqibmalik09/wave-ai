/**
 * Prisma client singleton.
 *
 * A PrismaClient opens a connection pool, so we must create exactly one per
 * process. Next.js dev (and Turbopack HMR) re-evaluates modules on every edit,
 * which would otherwise leak a new pool each time — so in non-production we
 * stash the instance on `globalThis` and reuse it across reloads.
 *
 * Server-only. Never import this from a Client Component (it would try to bundle
 * the query engine into the browser).
 *
 * At 2B-user scale `DATABASE_URL` should point at a pooler (pgbouncer) — see
 * .env.example. Prisma reads the URL from the environment at connect time.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Keep logging lean on the hot path: errors/warnings only, never queries
    // (which could log parameters) and never anything that stalls a request.
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
