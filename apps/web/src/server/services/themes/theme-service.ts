import { eq, desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { themes } from "@/server/db/schema/wiki";
import { NotFoundError, ForbiddenError, defaultThemeTokens } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";
import type { ThemeTokens } from "@next-wiki/shared";

export type ThemeRow = typeof themes.$inferSelect;

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as T;
  for (const key in override) {
    const b = base[key];
    const o = override[key];
    if (o !== undefined && b !== null && typeof b === "object" && typeof o === "object" && !Array.isArray(b)) {
      result[key] = deepMerge(b as object, o as Partial<object>) as T[typeof key];
    } else if (o !== undefined) {
      result[key] = o as T[typeof key];
    }
  }
  return result;
}

export async function getActiveThemeTokens(): Promise<ThemeTokens> {
  try {
    const db = getDb();
    const [active] = await db
      .select()
      .from(themes)
      .where(eq(themes.status, "active"))
      .limit(1);
    if (active?.tokenSet && Object.keys(active.tokenSet as object).length > 0) {
      // Deep-merge stored tokens onto defaults so partial tokenSets always yield a complete ThemeTokens.
      return deepMerge(defaultThemeTokens, active.tokenSet as Partial<ThemeTokens>);
    }
  } catch {
    // DB unavailable during cold start — fall through to defaults
  }
  return defaultThemeTokens;
}

export async function listThemes(actor: PermissionContext): Promise<ThemeRow[]> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  return db.select().from(themes).orderBy(desc(themes.createdAt)).limit(100);
}

export async function getTheme(id: string, actor: PermissionContext): Promise<ThemeRow> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  const [theme] = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  if (!theme) throw new NotFoundError(`Theme ${id} not found`);
  return theme;
}

export async function createTheme(
  input: { key: string; name: string; tokenSet?: Record<string, unknown> },
  actor: PermissionContext,
): Promise<ThemeRow> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  const [theme] = await db
    .insert(themes)
    .values({
      key: input.key,
      name: input.name,
      tokenSet: input.tokenSet ?? {},
      chromeConfig: {},
      origin: "custom",
      status: "draft",
      createdByUserId: actor.userId,
    })
    .returning();
  return theme!;
}

export async function updateTheme(
  id: string,
  input: { name?: string; tokenSet?: Record<string, unknown> },
  actor: PermissionContext,
): Promise<ThemeRow> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  const existing = await getTheme(id, actor);
  if (existing.origin === "system") throw new ForbiddenError("system themes cannot be modified");
  const [updated] = await db
    .update(themes)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.tokenSet !== undefined && { tokenSet: input.tokenSet }),
      updatedAt: new Date(),
    })
    .where(eq(themes.id, id))
    .returning();
  return updated!;
}

export async function activateTheme(id: string, actor: PermissionContext): Promise<ThemeRow> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  const target = await getTheme(id, actor);
  if (!target) throw new NotFoundError(`Theme ${id} not found`);
  // Demote current active theme to archived, then activate the target
  await db
    .update(themes)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(themes.status, "active"));
  const [activated] = await db
    .update(themes)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(themes.id, id))
    .returning();
  return activated!;
}

export async function deleteTheme(id: string, actor: PermissionContext): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError("admin required");
  const db = getDb();
  const existing = await getTheme(id, actor);
  if (existing.origin === "system") throw new ForbiddenError("system themes cannot be deleted");
  if (existing.status === "active") {
    throw new ForbiddenError("cannot delete the active theme; activate another theme first");
  }
  await db.delete(themes).where(eq(themes.id, id));
}
