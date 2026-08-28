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
  const { seedDatabase, seedE2eAdminFixture } = await import('./src/server/seed');
  const { loadDemoReadOnlyFromDb } = await import('./src/server/services/demo-mode');
  const { env } = await import('./src/server/config');

  await runMigrations();
  await seedDatabase();
  // Playwright's webServer sets this; never true for a real deployment. See
  // seedE2eAdminFixture's doc comment for why this fixture only exists here.
  // Hard-gated on NODE_ENV too — never let a stray/mistaken NEXT_WIKI_E2E in
  // a production environment create the well-known admin@example.com login.
  if (process.env.NEXT_WIKI_E2E === 'true' && env.NODE_ENV !== 'production') {
    await seedE2eAdminFixture();
  }
  await loadDemoReadOnlyFromDb();

  // Start the in-process pg-boss worker for migration and cleanup jobs. A
  // worker failure is logged but never blocks serving reads (jobs simply do not
  // run until the next boot).
  try {
    const { createBoss } = await import('./src/server/jobs/create-boss');
    const { registerJobs } = await import('./src/server/jobs/register');
    const { setBoss } = await import('./src/server/jobs/runtime');
    const { logger } = await import('./src/server/logger');

    const boss = createBoss();
    boss.on('error', (error: unknown) => logger.exception('pg-boss error', error));
    await boss.start();
    await registerJobs(boss);
    setBoss(boss);
    const { startFeishuLongConnection } = await import('./src/server/feishu/long-connection');
    await startFeishuLongConnection();
    logger.info('pg-boss worker started');
  } catch (error) {
    const { logger } = await import('./src/server/logger');
    logger.exception('failed to start pg-boss worker', error);
  }
}

/**
 * Next.js populates this with a fixed set of enum-like descriptors (see
 * RequestErrorContext in next/dist/server/instrumentation/types) — never
 * request/response data. Read defensively (it's typed `unknown` here) and
 * pick only these known-safe string fields, rather than logging the object
 * wholesale: an unknown value from framework internals isn't a promise that
 * every field is safe to log or that it will always be JSON-serializable.
 */
function describeRequestErrorContext(context: unknown): Record<string, string> {
  const picked: Record<string, string> = {};
  if (typeof context !== 'object' || context === null) return picked;
  for (const key of ['routerKind', 'routePath', 'routeType', 'renderSource', 'revalidateReason'] as const) {
    const value = (context as Record<string, unknown>)[key];
    if (typeof value === 'string') picked[key] = value;
  }
  return picked;
}

/**
 * Next.js's request-level error hook — the safety net for anything that
 * escapes a route handler's own try/catch (React Server Component render
 * errors, middleware, etc.). `withApiAudit`/`withPublicApi`/`handleApiError`
 * already log the exceptions they catch, so this necessarily overlaps with
 * them for API routes; it only adds coverage for what those can't see.
 */
export async function onRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string }>,
  context: unknown,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logger } = await import('./src/server/logger');
  logger.exception('Unhandled request error', error, {
    path: request.path,
    method: request.method,
    ...describeRequestErrorContext(context),
  });
}
