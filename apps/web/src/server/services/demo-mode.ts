import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, isDemoReadOnly, setDemoReadOnlyCache, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const SETTINGS_ID = 'default';

/**
 * Boot-time loader (called once from instrumentation.ts, after migrations).
 * If the site_settings row does not exist yet, bootstraps it from
 * NEXT_WIKI_DEMO_READONLY so a fresh demo deploy still starts locked down
 * without requiring a manual admin visit first — after this one-time
 * bootstrap, the DB row is the only thing that matters; the env var is never
 * consulted again.
 */
export async function loadDemoReadOnlyFromDb(): Promise<void> {
  const row = await db.query.siteSettings.findFirst({ where: eq(schema.siteSettings.id, SETTINGS_ID) });
  if (row) {
    setDemoReadOnlyCache(row.demoReadonly);
    return;
  }
  const initial = process.env.NEXT_WIKI_DEMO_READONLY === 'true';
  await db
    .insert(schema.siteSettings)
    .values({ id: SETTINGS_ID, demoReadonly: initial })
    .onConflictDoNothing({ target: schema.siteSettings.id });
  setDemoReadOnlyCache(initial);
}

/** Current state for the admin toggle UI. Requires manage_demo_mode. */
export async function getDemoModeView(ctx: PermCtx): Promise<{ enabled: boolean }> {
  if (!can(ctx, 'manage_demo_mode', { kind: 'demo_mode' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage demo mode');
  }
  return { enabled: isDemoReadOnly() };
}

/** Admin-toggleable at runtime; always permitted even while demo-readonly is active (see permissions/index.ts). */
export async function setDemoReadOnlyMode(ctx: PermCtx, value: boolean): Promise<boolean> {
  if (!can(ctx, 'manage_demo_mode', { kind: 'demo_mode' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage demo mode');
  }
  await db
    .insert(schema.siteSettings)
    .values({ id: SETTINGS_ID, demoReadonly: value, updatedBy: getActorUserId(ctx), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.siteSettings.id,
      set: { demoReadonly: value, updatedBy: getActorUserId(ctx), updatedAt: new Date() },
    });
  setDemoReadOnlyCache(value);
  return value;
}
