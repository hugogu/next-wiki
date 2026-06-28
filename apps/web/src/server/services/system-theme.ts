import { asc, eq } from 'drizzle-orm';
import type {
  ActivateSystemThemeInput,
  CreateSystemThemeInput,
  SystemThemeListView,
  SystemThemeView,
  UpdateSystemThemeInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { sanitizeSystemThemeCss } from '@/server/appearance/css-sanitize';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@/server/appearance/builtin-themes';

type ThemeRow = typeof schema.systemThemes.$inferSelect;

function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage system themes');
  }
}

function toSummary(row: ThemeRow): { id: string; name: string; isBuiltin: boolean } {
  return { id: row.id, name: row.name, isBuiltin: row.isBuiltin };
}

function toView(row: ThemeRow): SystemThemeView {
  return { id: row.id, name: row.name, css: row.css, isBuiltin: row.isBuiltin };
}

async function getRow(id: string): Promise<ThemeRow | null> {
  return (await db.query.systemThemes.findFirst({ where: eq(schema.systemThemes.id, id) })) ?? null;
}

async function getActiveThemeId(): Promise<string | null> {
  const row = await db.query.systemThemeSettings.findFirst({
    where: eq(schema.systemThemeSettings.id, 'default'),
    columns: { activeThemeId: true },
  });
  return row?.activeThemeId ?? null;
}

export async function listSystemThemes(ctx: PermCtx): Promise<SystemThemeListView> {
  assertCanManage(ctx);
  const rows = await db.query.systemThemes.findMany({
    orderBy: [asc(schema.systemThemes.isBuiltin), asc(schema.systemThemes.name)],
  });
  return {
    activeThemeId: await getActiveThemeId(),
    themes: rows.map(toSummary),
  };
}

export async function getSystemTheme(ctx: PermCtx, id: string): Promise<SystemThemeView> {
  assertCanManage(ctx);
  const row = await getRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'System theme not found');
  return toView(row);
}

async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const existing = await db.query.systemThemes.findFirst({
    where: eq(schema.systemThemes.name, name),
  });
  if (existing && existing.id !== excludeId) {
    throw new DomainError('CONFLICT', 'A system theme with this name already exists');
  }
}

/** Copy an existing system theme (typically a built-in) into a new editable row. */
export async function createSystemTheme(
  ctx: PermCtx,
  input: CreateSystemThemeInput,
): Promise<SystemThemeView> {
  assertCanManage(ctx);
  const source = await getRow(input.sourceThemeId);
  if (!source) throw new DomainError('NOT_FOUND', 'Source theme not found');
  await assertNameAvailable(input.name);

  const createdBy = getActorUserId(ctx);
  const [created] = await db
    .insert(schema.systemThemes)
    .values({
      name: input.name,
      css: sanitizeSystemThemeCss(source.css),
      isBuiltin: false,
      createdBy,
    })
    .returning();
  if (!created) throw new Error('Failed to create system theme');
  return toView(created);
}

/** Update a custom theme's name and/or CSS. Built-ins are read-only. */
export async function updateSystemTheme(
  ctx: PermCtx,
  id: string,
  input: UpdateSystemThemeInput,
): Promise<SystemThemeView> {
  assertCanManage(ctx);
  const row = await getRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'System theme not found');
  if (row.isBuiltin) {
    throw new DomainError('FORBIDDEN', 'Built-in themes are read-only — copy to edit');
  }
  if (input.name !== undefined) await assertNameAvailable(input.name, id);

  const updates: Partial<typeof schema.systemThemes.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.css !== undefined) updates.css = sanitizeSystemThemeCss(input.css);

  const [updated] = await db
    .update(schema.systemThemes)
    .set(updates)
    .where(eq(schema.systemThemes.id, id))
    .returning();
  if (!updated) throw new DomainError('NOT_FOUND', 'System theme not found');
  return toView(updated);
}

/** Delete a custom theme. Built-ins cannot be deleted. If the deleted theme
 * was active, the active pointer is cleared (the layout falls back to no
 * injected system CSS). */
export async function deleteSystemTheme(ctx: PermCtx, id: string): Promise<void> {
  assertCanManage(ctx);
  const row = await getRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'System theme not found');
  if (row.isBuiltin) {
    throw new DomainError('FORBIDDEN', 'Built-in themes cannot be deleted');
  }
  await db.delete(schema.systemThemes).where(eq(schema.systemThemes.id, id));
  const activeId = await getActiveThemeId();
  if (activeId === id) {
    await db
      .update(schema.systemThemeSettings)
      .set({ activeThemeId: null, updatedBy: getActorUserId(ctx), updatedAt: new Date() })
      .where(eq(schema.systemThemeSettings.id, 'default'));
  }
}

/** Activate a system theme (or null to clear the active selection). */
export async function activateSystemTheme(
  ctx: PermCtx,
  input: ActivateSystemThemeInput,
): Promise<{ activeThemeId: string | null }> {
  assertCanManage(ctx);
  let activeId: string | null = input.themeId;
  if (activeId !== null) {
    const row = await getRow(activeId);
    if (!row) throw new DomainError('NOT_FOUND', 'System theme not found');
    if (row.id === DEFAULT_THEME_ID) activeId = null;
  }
  const updatedBy = getActorUserId(ctx);
  await db
    .insert(schema.systemThemeSettings)
    .values({ id: 'default', activeThemeId: activeId, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.systemThemeSettings.id,
      set: { activeThemeId: activeId, updatedBy, updatedAt: new Date() },
    });
  return { activeThemeId: activeId };
}

/** Resolve the active theme's CSS for layout injection. Falls back to empty
 * string when no theme is active. */
export async function getActiveThemeCss(): Promise<string> {
  const activeId = await getActiveThemeId();
  if (!activeId) return '';
  const row = await getRow(activeId);
  return row?.css ?? '';
}

/** Idempotently seed the built-in themes. Called from the seed routine. */
export async function seedBuiltinSystemThemes(): Promise<void> {
  for (const theme of BUILTIN_THEMES) {
    await db
      .insert(schema.systemThemes)
      .values({ id: theme.id, name: theme.name, css: theme.css, isBuiltin: true })
      .onConflictDoUpdate({
        target: schema.systemThemes.id,
        set: { name: theme.name, css: theme.css, isBuiltin: true, updatedAt: new Date() },
      });
  }
}
