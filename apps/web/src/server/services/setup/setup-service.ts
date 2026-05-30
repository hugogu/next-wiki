// Setup state is cached after first successful check to avoid repeated DB queries.
let _isSetupComplete: boolean | null = null;

/**
 * Check whether first-run setup has been completed.
 * Reads the 'setup.complete' site setting from the database.
 */
export async function isSetupComplete(): Promise<boolean> {
  if (_isSetupComplete !== null) return _isSetupComplete;

  try {
    const { getDb } = await import("@/server/db/client");
    const db = getDb();
    const rows = await db.execute(
      "SELECT value FROM site_settings WHERE key = 'setup.complete' LIMIT 1",
    );
    const value = (rows.rows[0] as { value?: string } | undefined)?.value;
    _isSetupComplete = value === "true";
    return _isSetupComplete;
  } catch {
    // DB not yet available or migration pending — setup is incomplete.
    return false;
  }
}

/**
 * Mark setup as complete. Called at the end of the first-run wizard.
 * Idempotent: calling it multiple times is safe.
 */
export async function markSetupComplete(): Promise<void> {
  const { getDb } = await import("@/server/db/client");
  const db = getDb();
  await db.execute(
    `INSERT INTO site_settings (id, key, value, value_type, updated_at)
     VALUES (gen_random_uuid(), 'setup.complete', 'true', 'boolean', now())
     ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()`,
  );
  _isSetupComplete = true;
}

/** Reset the cached state (used in tests). */
export function resetSetupCache(): void {
  _isSetupComplete = null;
}
