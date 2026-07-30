import type { Sql } from 'postgres';

/**
 * Rebase a database whose `drizzle.__drizzle_migrations` still holds the
 * pre-squash per-migration history onto the squashed init baseline. No-op for a
 * fresh or already-rebased database.
 */
export declare function resetLegacyMigrationHistory(client: Sql): Promise<void>;
