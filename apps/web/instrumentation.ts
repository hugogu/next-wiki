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

  // Start the in-process pg-boss worker for migration and cleanup jobs. A
  // worker failure is logged but never blocks serving reads (jobs simply do not
  // run until the next boot).
  try {
    const { createBoss } = await import('./src/server/jobs/create-boss');
    const { registerJobs } = await import('./src/server/jobs/register');
    const { setBoss } = await import('./src/server/jobs/runtime');
    const { logger } = await import('./src/server/logger');

    const boss = createBoss();
    boss.on('error', (error: unknown) => logger.error('pg-boss error', { error: String(error) }));
    await boss.start();
    await registerJobs(boss);
    setBoss(boss);
    logger.info('pg-boss worker started');
  } catch (error) {
    const { logger } = await import('./src/server/logger');
    logger.error('failed to start pg-boss worker', { error: String(error) });
  }
}
