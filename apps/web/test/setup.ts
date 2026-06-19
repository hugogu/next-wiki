import { assertIsTestDatabase } from './test-db';

/**
 * Runs inside every test worker before any test. Hard-fails if the worker's
 * DATABASE_URL is not a dedicated `*_test` database, so a misconfigured env can
 * never let the destructive suites truncate development data.
 */
assertIsTestDatabase(process.env.DATABASE_URL ?? '');
