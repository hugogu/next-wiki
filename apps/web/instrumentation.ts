/**
 * Next.js instrumentation hook. Runs once per server process at startup
 * (not per request), which is where one-time bootstrap belongs. Keeping
 * migrations off the request path preserves horizontal scalability and the
 * "no per-request distributed lock" mandate in AGENTS.md.
 *
 * In Docker, migrations also run ahead of `next start` via docker/start.mjs;
 * drizzle's migrator is idempotent, so this is safe and additionally covers
 * local `next dev` / `next start`.
 */
export async function register() {
  // Guard against the edge runtime, where the postgres driver cannot load.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { runMigrations } = await import('./src/server/db/migrate');
  const { seedDatabase } = await import('./src/server/seed');

  await runMigrations();
  await seedDatabase();
}
