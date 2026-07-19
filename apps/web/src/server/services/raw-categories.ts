import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { slugSchema } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertSpaceKindAllowed } from '@/server/services/writing-mode';

export type RawCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  isRetired: boolean;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
};

type CategoryRow = typeof schema.rawCategories.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function assertAdmin(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage raw categories');
  }
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to manage raw categories');
  return userId;
}

const nameSchema = { min: 1, max: 100 };

function parseName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < nameSchema.min || value.trim().length > nameSchema.max) {
    throw new DomainError('BAD_REQUEST', 'Category name must be 1–100 characters');
  }
  return value.trim();
}

function parseSlug(value: unknown): string {
  const parsed = slugSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('BAD_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid category slug');
  return parsed.data;
}

function toView(row: CategoryRow, entryCount: number): RawCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isDefault: row.isDefault,
    isRetired: row.isRetired,
    entryCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The partial unique index allows only one default; clear any other default in
 * the same transaction before marking this row so the flip never collides. */
async function clearOtherDefaults(tx: Tx, exceptId: string | null): Promise<void> {
  const where = exceptId
    ? and(eq(schema.rawCategories.isDefault, true), ne(schema.rawCategories.id, exceptId))
    : eq(schema.rawCategories.isDefault, true);
  await tx.update(schema.rawCategories).set({ isDefault: false, updatedAt: new Date() }).where(where);
}

async function countEntries(tx: Tx, categoryId: string): Promise<number> {
  const rows = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.pages)
    .where(and(eq(schema.pages.rawCategoryId, categoryId), isNull(schema.pages.deletedAt)));
  return rows[0]?.value ?? 0;
}

export async function listCategories(ctx: PermCtx): Promise<RawCategory[]> {
  assertAdmin(ctx);
  const rows = await db
    .select({
      category: schema.rawCategories,
      entryCount: sql<number>`count(${schema.pages.id}) filter (where ${schema.pages.deletedAt} is null)::int`,
    })
    .from(schema.rawCategories)
    .leftJoin(schema.pages, eq(schema.pages.rawCategoryId, schema.rawCategories.id))
    .groupBy(schema.rawCategories.id)
    .orderBy(schema.rawCategories.name);
  return rows.map((row) => toView(row.category, row.entryCount ?? 0));
}

export async function createCategory(
  ctx: PermCtx,
  input: { name: unknown; slug: unknown; description?: unknown; isDefault?: unknown },
): Promise<RawCategory> {
  const userId = assertAdmin(ctx);
  await assertSpaceKindAllowed('raw');
  const name = parseName(input.name);
  const slug = parseSlug(input.slug);
  const description = input.description === undefined || input.description === null ? null : String(input.description);
  const isDefault = input.isDefault === true;

  const created = await db.transaction(async (tx) => {
    if (isDefault) await clearOtherDefaults(tx, null);
    try {
      const [row] = await tx
        .insert(schema.rawCategories)
        .values({ name, slug, description, isDefault, updatedBy: userId })
        .returning();
      if (!row) throw new Error('Failed to create raw category');
      return row;
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  });
  return toView(created, 0);
}

export async function updateCategory(
  ctx: PermCtx,
  id: string,
  patch: { name?: unknown; slug?: unknown; description?: unknown; isDefault?: unknown },
): Promise<RawCategory> {
  const userId = assertAdmin(ctx);
  await assertSpaceKindAllowed('raw');

  const updated = await db.transaction(async (tx) => {
    const existing = await tx.query.rawCategories.findFirst({ where: eq(schema.rawCategories.id, id) });
    if (!existing) throw new DomainError('NOT_FOUND', 'Raw category not found');

    const values: Partial<CategoryRow> = { updatedBy: userId, updatedAt: new Date() };
    if (patch.name !== undefined) values.name = parseName(patch.name);
    if (patch.slug !== undefined) values.slug = parseSlug(patch.slug);
    if (patch.description !== undefined) values.description = patch.description === null ? null : String(patch.description);
    if (patch.isDefault !== undefined) values.isDefault = patch.isDefault === true;

    if (values.isDefault === true) await clearOtherDefaults(tx, id);
    let row: CategoryRow | undefined;
    try {
      [row] = await tx.update(schema.rawCategories).set(values).where(eq(schema.rawCategories.id, id)).returning();
    } catch (error) {
      throw translateUniqueViolation(error);
    }
    if (!row) throw new Error('Failed to update raw category');
    return { row, entryCount: await countEntries(tx, id) };
  });
  return toView(updated.row, updated.entryCount);
}

/** Retire keeps history intact: existing entries stay filed, but the category no
 * longer accepts new entries. Preferred over delete when entries reference it. */
export async function retireCategory(ctx: PermCtx, id: string): Promise<RawCategory> {
  const userId = assertAdmin(ctx);
  await assertSpaceKindAllowed('raw');
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.rawCategories)
      .set({ isRetired: true, isDefault: false, updatedBy: userId, updatedAt: new Date() })
      .where(eq(schema.rawCategories.id, id))
      .returning();
    if (!row) throw new DomainError('NOT_FOUND', 'Raw category not found');
    return { row, entryCount: await countEntries(tx, id) };
  });
  return toView(updated.row, updated.entryCount);
}

/** Hard delete is only allowed while no entry references the category; otherwise
 * the admin must retire it. */
export async function deleteCategory(ctx: PermCtx, id: string): Promise<void> {
  assertAdmin(ctx);
  await assertSpaceKindAllowed('raw');
  await db.transaction(async (tx) => {
    const existing = await tx.query.rawCategories.findFirst({ where: eq(schema.rawCategories.id, id) });
    if (!existing) throw new DomainError('NOT_FOUND', 'Raw category not found');
    if ((await countEntries(tx, id)) > 0) {
      throw new DomainError('RAW_CATEGORY_HAS_ENTRIES', 'Retire this category instead — raw entries still reference it');
    }
    await tx.delete(schema.rawCategories).where(eq(schema.rawCategories.id, id));
  });
}

/**
 * Resolves the category a raw create should file under: an explicit id must
 * exist and not be retired; when omitted, the admin-configured default applies;
 * with neither, the create is rejected so no raw entry is ever left uncategorized.
 * Callable inside a raw-create transaction.
 */
export async function resolveCategoryForCreate(
  categoryId: string | undefined,
  tx?: Tx,
): Promise<string> {
  const conn = tx ?? db;
  if (categoryId) {
    const row = await conn.query.rawCategories.findFirst({ where: eq(schema.rawCategories.id, categoryId) });
    if (!row) throw new DomainError('BAD_REQUEST', 'Raw category not found');
    if (row.isRetired) throw new DomainError('RAW_CATEGORY_RETIRED', 'This raw category is retired and cannot accept new entries');
    return row.id;
  }
  const fallback = await conn.query.rawCategories.findFirst({
    where: and(eq(schema.rawCategories.isDefault, true), eq(schema.rawCategories.isRetired, false)),
  });
  if (!fallback) {
    throw new DomainError('RAW_CATEGORY_REQUIRED', 'A raw category is required — create one or configure a default first');
  }
  return fallback.id;
}

function translateUniqueViolation(error: unknown): unknown {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('raw_categories_slug_unique')) return new DomainError('CONFLICT', 'A category with this slug already exists');
  if (message.includes('raw_categories_name_unique')) return new DomainError('CONFLICT', 'A category with this name already exists');
  return error;
}
