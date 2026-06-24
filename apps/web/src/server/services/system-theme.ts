import { eq } from 'drizzle-orm';
import type { SystemThemeView, UpdateSystemThemeInput } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { sanitizeSystemThemeCss } from '@/server/appearance/css-sanitize';
import { BUILTIN_TEMPLATES } from '@/server/appearance/builtin-themes';

const SETTINGS_ID = 'default';

function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage the system theme');
  }
}

type Row = typeof schema.systemThemeSettings.$inferSelect;

async function getRow(): Promise<Row | null> {
  return (
    (await db.query.systemThemeSettings.findFirst({
      where: eq(schema.systemThemeSettings.id, SETTINGS_ID),
    })) ?? null
  );
}

/** Raw CSS for injection. Empty string when no row. */
export async function getSystemThemeCss(): Promise<string> {
  return (await getRow())?.css ?? '';
}

export async function getSystemThemeView(): Promise<SystemThemeView> {
  const row = await getRow();
  return {
    css: row?.css ?? '',
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    templates: BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, css: t.css })),
  };
}

/** Replace the admin-authored CSS. Sanitizes on save. Requires `manage_appearance`. */
export async function updateSystemThemeCss(
  ctx: PermCtx,
  input: UpdateSystemThemeInput,
): Promise<SystemThemeView> {
  assertCanManage(ctx);
  const sanitized = sanitizeSystemThemeCss(input.css);

  const values = {
    id: SETTINGS_ID,
    css: sanitized,
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.systemThemeSettings)
    .values(values)
    .onConflictDoUpdate({
      target: schema.systemThemeSettings.id,
      set: { css: sanitized, updatedBy: values.updatedBy, updatedAt: values.updatedAt },
    });

  return {
    css: sanitized,
    updatedAt: values.updatedAt.toISOString(),
    templates: BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, css: t.css })),
  };
}
