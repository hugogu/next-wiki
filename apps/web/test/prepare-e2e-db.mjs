import postgres from 'postgres';
import { rm } from 'node:fs/promises';

const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error('E2E_DATABASE_URL is required');

const parsed = new URL(url);
const database = parsed.pathname.replace(/^\//, '');
if (!database.endsWith('_test')) {
  throw new Error(`Refusing to prepare non-test database "${database}"`);
}

parsed.pathname = '/postgres';
const admin = postgres(parsed.toString(), { max: 1 });
try {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${database}"`);
} finally {
  await admin.end({ timeout: 5 });
}

// The e2e server renders public pages through force-static ISR persisted under
// .next-e2e/dev/cache (dev-server layout). Drop it alongside the database so a
// previous run's cached pages can never leak into a fresh run.
await rm(new URL('../.next-e2e/dev/cache', import.meta.url), { recursive: true, force: true });
