import postgres from 'postgres';

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
