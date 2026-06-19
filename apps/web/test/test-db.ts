/**
 * Single source of truth for the database the test suite runs against.
 *
 * Tests are destructive — every suite truncates tables in `beforeAll`. To avoid
 * wiping development data they MUST run against a dedicated, throwaway database
 * whose name ends with `_test`. The URL is configurable via `TEST_DATABASE_URL`
 * so CI or a different local Postgres can be targeted without code changes.
 */
const DEFAULT_TEST_DATABASE_URL = 'postgresql://wiki:wiki@localhost:15433/wiki_test';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

/** Extract the database name from a Postgres connection URL. */
export function getDatabaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/**
 * Guard against accidentally pointing the destructive test suite at a non-test
 * database (e.g. the shared dev/docker `wiki` database).
 */
export function assertIsTestDatabase(url: string): void {
  const name = getDatabaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}": the test database name must end with "_test". ` +
        `Set TEST_DATABASE_URL to a dedicated test database to protect development data.`,
    );
  }
}
