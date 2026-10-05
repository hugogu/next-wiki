import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * A page's language is optional: nothing assigns one, an original may have
 * none, and a translation always has one. These pin that at the database, where
 * the rules have to hold whichever code path writes the row.
 */

let spaceId: string;
let authorId: string;
const createdPageIds: string[] = [];

type PageInsert = typeof schema.pages.$inferInsert;

async function insertOriginal(values: Partial<PageInsert> & { path: string }) {
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId,
      slug: `${values.path}-${randomUUID().slice(0, 8)}`,
      authorId,
      title: values.path,
      ...values,
    })
    .returning();
  createdPageIds.push(page!.id);
  return page!;
}

function insertTranslation(sourceId: string, path: string, locale: string | null) {
  return db
    .insert(schema.pages)
    .values({
      spaceId,
      slug: '',
      path,
      title: path,
      authorId,
      locale,
      translationGroupId: randomUUID(),
      sourcePageId: sourceId,
    })
    .returning();
}

/** Drizzle wraps the driver error, so the SQLSTATE sits on `cause`. */
function sqlState(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | undefined;
  return candidate?.code ?? candidate?.cause?.code;
}

async function sqlStateOf(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return sqlState(error);
  }
}

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `page-locale-${randomUUID()}@example.com`, passwordHash: 'TEST', role: 'admin' })
    .returning();
  authorId = user!.id;
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: `page-locale-${randomUUID().slice(0, 8)}`, name: 'Page locale' })
    .returning();
  spaceId = space!.id;
});

afterAll(async () => {
  await db.delete(schema.pages).where(eq(schema.pages.spaceId, spaceId));
  await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
  await db.delete(schema.users).where(eq(schema.users.id, authorId));
  await closeDb();
});

describe('a page has no language unless it is given one', () => {
  it('stores none by default', async () => {
    const page = await insertOriginal({ path: 'no-language' });
    expect(page.locale).toBeNull();
  });

  it('stores the language it is given', async () => {
    const page = await insertOriginal({ path: 'chinese', locale: 'zh' });
    expect(page.locale).toBe('zh');
  });
});

describe('the tree identity key (space, path, language)', () => {
  it('still keeps two originals with no language from sharing a path', async () => {
    await insertOriginal({ path: 'shared-path' });
    const state = await sqlStateOf(insertOriginal({ path: 'shared-path' }));
    // 23505 unique_violation: "no language" counts as a value of its own.
    expect(state).toBe('23505');
  });

  it('lets an original with no language share a path with its English translation', async () => {
    const original = await insertOriginal({ path: 'guide' });
    const [translation] = await insertTranslation(original.id, 'guide', 'en');
    expect(translation?.locale).toBe('en');
  });

  it('keeps an original written in English from sharing a path with an English translation', async () => {
    const original = await insertOriginal({ path: 'english-original', locale: 'en' });
    const state = await sqlStateOf(insertTranslation(original.id, 'english-original', 'en'));
    expect(state).toBe('23505');
  });
});

describe('a translation always has a language', () => {
  it('rejects a translation row without one', async () => {
    const original = await insertOriginal({ path: 'needs-a-language' });
    const state = await sqlStateOf(insertTranslation(original.id, 'needs-a-language', null));
    // 23514 check_violation: pages_translation_has_locale.
    expect(state).toBe('23514');
  });
});

describe('the migration that made the language optional', () => {
  /** The data statement, read from the migration itself so this cannot drift. */
  function migrationStatement(): string {
    const dir = join(__dirname, 'migrations');
    const marker = 'UPDATE "pages" SET "locale" = NULL';
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      const start = text.indexOf(marker);
      if (start === -1) continue;
      return text.slice(start, text.indexOf(';', start) + 1);
    }
    throw new Error('migration data statement not found');
  }

  it('clears the English placeholder from originals and leaves every real language alone', async () => {
    const placeholder = await insertOriginal({ path: 'migrated-placeholder', locale: 'en' });
    const chinese = await insertOriginal({ path: 'migrated-chinese', locale: 'zh' });
    const unset = await insertOriginal({ path: 'migrated-unset' });
    const source = await insertOriginal({ path: 'migrated-source', locale: 'ja' });
    const [translation] = await insertTranslation(source.id, 'migrated-source', 'en');

    await db.execute(sql.raw(migrationStatement()));

    const rows = await db
      .select({ id: schema.pages.id, locale: schema.pages.locale })
      .from(schema.pages)
      .where(inArray(schema.pages.id, [placeholder.id, chinese.id, unset.id, source.id, translation!.id]));
    const byId = new Map(rows.map((row) => [row.id, row.locale]));
    expect(byId.get(placeholder.id)).toBeNull();
    expect(byId.get(chinese.id)).toBe('zh');
    expect(byId.get(unset.id)).toBeNull();
    expect(byId.get(source.id)).toBe('ja');
    // A translation's language is what it is written in: never cleared.
    expect(byId.get(translation!.id)).toBe('en');
  });
});
