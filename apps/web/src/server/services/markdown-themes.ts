import { and, asc, eq, or } from 'drizzle-orm';
import type {
  ActivateMarkdownThemeInput,
  CreateMarkdownThemeInput,
  MarkdownThemeListView,
  MarkdownThemeView,
  UpdateMarkdownThemeInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { sanitizeThemeCss } from '@/server/appearance/css-sanitize';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@/server/appearance/builtin-themes';

type ThemeRow = typeof schema.markdownThemes.$inferSelect;

function requireUserId(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage Markdown themes');
  }
  return ctx.actor.userId;
}

/** A theme is viewable if it is a built-in or owned by the caller. */
function canView(row: ThemeRow, userId: string): boolean {
  return row.isBuiltin || row.ownerUserId === userId;
}

async function getRow(id: string): Promise<ThemeRow | null> {
  return (await db.query.markdownThemes.findFirst({ where: eq(schema.markdownThemes.id, id) })) ?? null;
}

async function getActiveThemeId(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { activeMarkdownThemeId: true },
  });
  return user?.activeMarkdownThemeId ?? null;
}

export async function listThemes(ctx: PermCtx): Promise<MarkdownThemeListView> {
  const userId = requireUserId(ctx);
  const rows = await db.query.markdownThemes.findMany({
    where: or(eq(schema.markdownThemes.isBuiltin, true), eq(schema.markdownThemes.ownerUserId, userId)),
    orderBy: [asc(schema.markdownThemes.isBuiltin), asc(schema.markdownThemes.name)],
  });
  return {
    activeThemeId: await getActiveThemeId(userId),
    themes: rows.map((row) => ({
      id: row.id,
      name: row.name,
      isBuiltin: row.isBuiltin,
      owned: row.ownerUserId === userId,
    })),
  };
}

function toView(row: ThemeRow, userId: string): MarkdownThemeView {
  return {
    id: row.id,
    name: row.name,
    css: row.css,
    isBuiltin: row.isBuiltin,
    owned: row.ownerUserId === userId,
  };
}

export async function getTheme(ctx: PermCtx, id: string): Promise<MarkdownThemeView> {
  const userId = requireUserId(ctx);
  const row = await getRow(id);
  if (!row || !canView(row, userId)) throw new DomainError('NOT_FOUND', 'Theme not found');
  return toView(row, userId);
}

async function assertNameAvailable(userId: string, name: string, excludeId?: string): Promise<void> {
  const existing = await db.query.markdownThemes.findFirst({
    where: and(eq(schema.markdownThemes.ownerUserId, userId), eq(schema.markdownThemes.name, name)),
  });
  if (existing && existing.id !== excludeId) {
    throw new DomainError('CONFLICT', 'You already have a theme with this name');
  }
}

/** Create a personal theme by copying an existing (viewable) theme. */
export async function createTheme(ctx: PermCtx, input: CreateMarkdownThemeInput): Promise<MarkdownThemeView> {
  const userId = requireUserId(ctx);
  const source = await getRow(input.sourceThemeId);
  if (!source || !canView(source, userId)) throw new DomainError('NOT_FOUND', 'Source theme not found');
  await assertNameAvailable(userId, input.name);

  const [created] = await db
    .insert(schema.markdownThemes)
    .values({
      ownerUserId: userId,
      name: input.name,
      css: sanitizeThemeCss(source.css),
      isBuiltin: false,
    })
    .returning();
  if (!created) throw new Error('Failed to create theme');
  return toView(created, userId);
}

/** Update a personal theme's name and/or CSS. Built-ins are read-only. */
export async function updateTheme(
  ctx: PermCtx,
  id: string,
  input: UpdateMarkdownThemeInput,
): Promise<MarkdownThemeView> {
  const userId = requireUserId(ctx);
  const row = await getRow(id);
  if (!row || (!row.isBuiltin && row.ownerUserId !== userId)) {
    throw new DomainError('NOT_FOUND', 'Theme not found');
  }
  if (row.isBuiltin || row.ownerUserId !== userId) {
    throw new DomainError('FORBIDDEN', 'Built-in themes are read-only — create a copy to edit');
  }
  if (input.name !== undefined) await assertNameAvailable(userId, input.name, id);

  const updates: Partial<typeof schema.markdownThemes.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.css !== undefined) updates.css = sanitizeThemeCss(input.css);

  const [updated] = await db
    .update(schema.markdownThemes)
    .set(updates)
    .where(eq(schema.markdownThemes.id, id))
    .returning();
  if (!updated) throw new DomainError('NOT_FOUND', 'Theme not found');
  return toView(updated, userId);
}

/** Delete a personal theme. If it was active, fall back to Default. */
export async function deleteTheme(ctx: PermCtx, id: string): Promise<void> {
  const userId = requireUserId(ctx);
  const row = await getRow(id);
  if (!row || (!row.isBuiltin && row.ownerUserId !== userId)) {
    throw new DomainError('NOT_FOUND', 'Theme not found');
  }
  if (row.isBuiltin || row.ownerUserId !== userId) {
    throw new DomainError('FORBIDDEN', 'Built-in themes cannot be deleted');
  }
  if ((await getActiveThemeId(userId)) === id) {
    await db.update(schema.users).set({ activeMarkdownThemeId: null }).where(eq(schema.users.id, userId));
  }
  await db.delete(schema.markdownThemes).where(eq(schema.markdownThemes.id, id));
}

/** Activate a theme (or null ⇒ Default) for the caller. */
export async function activateTheme(
  ctx: PermCtx,
  input: ActivateMarkdownThemeInput,
): Promise<{ activeThemeId: string | null }> {
  const userId = requireUserId(ctx);
  let activeId: string | null = input.themeId;
  if (activeId !== null) {
    const row = await getRow(activeId);
    if (!row || !canView(row, userId)) throw new DomainError('NOT_FOUND', 'Theme not found');
    // The Default built-in is represented as "no override".
    if (row.id === DEFAULT_THEME_ID) activeId = null;
  }
  await db.update(schema.users).set({ activeMarkdownThemeId: activeId }).where(eq(schema.users.id, userId));
  return { activeThemeId: activeId };
}

const DEFAULT_CSS = BUILTIN_THEMES.find((t) => t.id === DEFAULT_THEME_ID)?.css ?? '';

/** Resolve the raw (un-scoped) CSS of a user's active theme for injection. */
export async function getActiveThemeCss(userId: string | null): Promise<string> {
  if (!userId) return DEFAULT_CSS;
  const activeId = await getActiveThemeId(userId);
  if (!activeId) return DEFAULT_CSS;
  const row = await getRow(activeId);
  return row?.css ?? DEFAULT_CSS;
}

/** Idempotently seed the built-in themes (called from the seed routine). */
export async function seedBuiltinThemes(): Promise<void> {
  for (const theme of BUILTIN_THEMES) {
    await db
      .insert(schema.markdownThemes)
      .values({ id: theme.id, ownerUserId: null, name: theme.name, css: theme.css, isBuiltin: true })
      .onConflictDoUpdate({
        target: schema.markdownThemes.id,
        set: { name: theme.name, css: theme.css, isBuiltin: true, updatedAt: new Date() },
      });
  }
}
