import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { setModeInternal } from '@/server/services/writing-mode';
import * as categories from '@/server/services/raw-categories';
import { resolveCategoryForCreate } from '@/server/services/raw-categories';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

async function ensureRawSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false })
    .onConflictDoNothing()
    .returning();
  return space ?? (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') }))!;
}

describe('raw categories service', () => {
  let adminCtx: ReturnType<typeof buildUserCtx>;
  let editorCtx: ReturnType<typeof buildUserCtx>;
  let rawSpaceId: string;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    const raw = await ensureRawSpace();
    rawSpaceId = raw.id;
    await setModeInternal('llm-wiki', null);
    const { userId } = await createAdminUser({ email: 'raw-cat-admin@example.com' });
    adminCtx = buildUserCtx(userId, 'admin');
    const [editor] = await db
      .insert(schema.users)
      .values({ email: 'raw-cat-editor@example.com', passwordHash: 'HASH', role: 'editor', status: 'active' })
      .returning();
    editorCtx = buildUserCtx(editor!.id, 'editor');
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('rejects non-admin callers', async () => {
    await expect(categories.listCategories(editorCtx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      categories.createCategory(editorCtx, { name: 'Support', slug: 'support' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<DomainError>);
  });

  it('keeps at most one default across create/update', async () => {
    const first = await categories.createCategory(adminCtx, { name: 'Support', slug: 'support', isDefault: true });
    const second = await categories.createCategory(adminCtx, { name: 'Ops', slug: 'ops', isDefault: true });
    expect(second.isDefault).toBe(true);

    const list = await categories.listCategories(adminCtx);
    expect(list.filter((c) => c.isDefault)).toHaveLength(1);
    expect(list.find((c) => c.id === first.id)?.isDefault).toBe(false);

    // Promoting the first back to default demotes the second.
    await categories.updateCategory(adminCtx, first.id, { isDefault: true });
    const after = await categories.listCategories(adminCtx);
    expect(after.filter((c) => c.isDefault).map((c) => c.id)).toEqual([first.id]);
  });

  it('enforces slug and name uniqueness', async () => {
    await categories.createCategory(adminCtx, { name: 'Support', slug: 'support' });
    await expect(
      categories.createCategory(adminCtx, { name: 'Other', slug: 'support' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      categories.createCategory(adminCtx, { name: 'Support', slug: 'other' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('retires a category and reports it', async () => {
    const cat = await categories.createCategory(adminCtx, { name: 'Legacy', slug: 'legacy', isDefault: true });
    const retired = await categories.retireCategory(adminCtx, cat.id);
    expect(retired).toMatchObject({ isRetired: true, isDefault: false });
  });

  it('reports entryCount and blocks delete while entries reference the category', async () => {
    const cat = await categories.createCategory(adminCtx, { name: 'Support', slug: 'support' });
    const [author] = await db
      .insert(schema.users)
      .values({ email: 'raw-cat-author@example.com', passwordHash: 'HASH', role: 'admin', status: 'active' })
      .returning();
    await db.insert(schema.pages).values({
      spaceId: rawSpaceId,
      slug: 'evidence',
      path: 'evidence',
      title: 'Evidence',
      authorId: author!.id,
      nature: 'original',
      visibility: 'restricted',
      rawCategoryId: cat.id,
    });

    const list = await categories.listCategories(adminCtx);
    expect(list.find((c) => c.id === cat.id)?.entryCount).toBe(1);
    await expect(categories.deleteCategory(adminCtx, cat.id)).rejects.toMatchObject({
      code: 'RAW_CATEGORY_HAS_ENTRIES',
    } satisfies Partial<DomainError>);
  });

  it('deletes a category with no entries', async () => {
    const cat = await categories.createCategory(adminCtx, { name: 'Empty', slug: 'empty' });
    await expect(categories.deleteCategory(adminCtx, cat.id)).resolves.toBeUndefined();
    await expect(categories.listCategories(adminCtx)).resolves.toHaveLength(0);
  });

  describe('resolveCategoryForCreate', () => {
    it('applies the default silently when no id is given', async () => {
      const def = await categories.createCategory(adminCtx, { name: 'Default', slug: 'default-cat', isDefault: true });
      await expect(resolveCategoryForCreate(undefined)).resolves.toBe(def.id);
    });

    it('requires a category when none is configured', async () => {
      await expect(resolveCategoryForCreate(undefined)).rejects.toMatchObject({
        code: 'RAW_CATEGORY_REQUIRED',
      } satisfies Partial<DomainError>);
    });

    it('rejects a retired explicit category', async () => {
      const cat = await categories.createCategory(adminCtx, { name: 'Legacy', slug: 'legacy' });
      await categories.retireCategory(adminCtx, cat.id);
      await expect(resolveCategoryForCreate(cat.id)).rejects.toMatchObject({
        code: 'RAW_CATEGORY_RETIRED',
      } satisfies Partial<DomainError>);
    });

    it('returns an explicit active category id', async () => {
      const cat = await categories.createCategory(adminCtx, { name: 'Support', slug: 'support' });
      await expect(resolveCategoryForCreate(cat.id)).resolves.toBe(cat.id);
    });
  });
});
