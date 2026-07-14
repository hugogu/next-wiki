import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import { fullTextContentQuery, fullTextPageQuery } from './engines/postgres-tsvector';
import { fuzzyContentQuery, fuzzyTitleQuery, WORD_SIMILARITY_THRESHOLD } from './engines/postgres-trigram';

/**
 * Query-plan contract for the final adapter predicates (T023): every window
 * query MUST stay compatible with the GIN indexes provisioned by migration
 * 0007_fast_keyword_search.sql. The corpus is seeded at a realistic size and
 * sequential scans are disabled inside the inspection transaction, so a
 * predicate that silently stops matching its index expression fails here
 * instead of degrading production search.
 */

const PLAN_SPACE_ID = '77777777-7777-4777-8777-777777777777';
const PLAN_USER_ID = '77777777-7777-4777-8777-777777777778';
const CORPUS_SIZE = 20_000;

async function explain(query: { getSQL: () => unknown }): Promise<string> {
  return db.transaction(async (tx) => {
    // GIN indexes only ever serve bitmap scans. Disabling sequential and
    // plain index scans forces the planner to reveal whether the predicate
    // is index-compatible at all — the actual assertion of this contract.
    await tx.execute(sql`set local enable_seqscan = off`);
    await tx.execute(sql`set local enable_indexscan = off`);
    await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`);
    const rows = await tx.execute(sql`explain (analyze, buffers) ${query.getSQL()}`);
    const plan = (rows as Array<Record<string, string>>).map((row) => Object.values(row)[0]).join('\n');
    console.log('PLAN>>>\n' + plan);
    return plan;
  });
}

beforeAll(async () => {
  await db.execute(sql`
    insert into users (id, email, password_hash, role, status)
    values (${PLAN_USER_ID}, ${`plan-${randomUUID()}@example.com`}, 'x', 'editor', 'active')
    on conflict (id) do nothing
  `);
  await db.execute(sql`
    insert into spaces (id, slug, name)
    values (${PLAN_SPACE_ID}, 'search-plan-space', 'Search Plan Space')
    on conflict (id) do nothing
  `);
  await cleanupCorpus();
  // Only a handful of rows contain the probed terms and everything lives in
  // one space, mirroring a realistic single-space wiki: the GIN predicates are
  // selective while the space filter is not, so the planner's index choice
  // here reflects the production shape.
  await db.execute(sql`
    insert into pages (id, space_id, slug, path, title, author_id)
    select gen_random_uuid(), ${PLAN_SPACE_ID}, 'plan-' || i, 'plan/page-' || i,
      case when i <= 5 then 'Special 搜索架构设计 ' || i else 'Ordinary Note ' || i end,
      ${PLAN_USER_ID}
    from generate_series(1, ${sql.raw(String(CORPUS_SIZE))}) i
  `);
  await db.execute(sql`
    insert into page_revisions (id, page_id, version_number, status, content_type, content_source, content_html, content_hash, author_id)
    select gen_random_uuid(), p.id, 1, 'published', 'text/markdown',
      case when p.title like 'Special%'
        then '跨境支付对账流程说明 rare corpus token about payment ' || repeat('filler ', 20)
        else 'ordinary document body ' || p.slug || ' ' || repeat('filler ', 20)
      end,
      '<p>x</p>', md5(p.slug), ${PLAN_USER_ID}
    from pages p where p.space_id = ${PLAN_SPACE_ID}
  `);
  await db.execute(sql`
    update pages p set current_published_version_id = r.id
    from page_revisions r where r.page_id = p.id and p.space_id = ${PLAN_SPACE_ID}
  `);
  await db.execute(sql`analyze pages`);
  await db.execute(sql`analyze page_revisions`);
});

async function cleanupCorpus(): Promise<void> {
  await db.execute(sql`update pages set current_published_version_id = null, latest_version_id = null where space_id = ${PLAN_SPACE_ID}`);
  await db.execute(sql`delete from page_revisions where page_id in (select id from pages where space_id = ${PLAN_SPACE_ID})`);
  await db.execute(sql`delete from pages where space_id = ${PLAN_SPACE_ID}`);
}

afterAll(async () => {
  await cleanupCorpus();
  await db.execute(sql`delete from spaces where id = ${PLAN_SPACE_ID}`);
  await db.execute(sql`delete from users where id = ${PLAN_USER_ID}`);
  await closeDb();
});

describe('full_text adapter query plans (tsvector, simple configuration)', () => {
  it('drives the path/title window through pages_keyword_fts_idx', async () => {
    const plan = await explain(fullTextPageQuery(PLAN_SPACE_ID, 'special 搜索架构设计', 40));
    expect(plan).toContain('pages_keyword_fts_idx');
    expect(plan).toContain('Bitmap Index Scan');
  });

  it('drives the content window through page_revisions_content_fts_idx', async () => {
    const plan = await explain(fullTextContentQuery(PLAN_SPACE_ID, 'rare corpus token', 40));
    expect(plan).toContain('page_revisions_content_fts_idx');
    expect(plan).toContain('Bitmap Index Scan');
  });
});

describe('fuzzy adapter query plans (pg_trgm)', () => {
  it('drives the scoped title window through pages_space_title_trgm_idx', async () => {
    const plan = await explain(fuzzyTitleQuery(PLAN_SPACE_ID, '搜索架构', 40));
    expect(plan).toContain('pages_space_title_trgm_idx');
    expect(plan).toContain('Bitmap Index Scan');
  });

  it('drives the Chinese-fragment content window through page_revisions_content_source_trgm_idx', async () => {
    const plan = await explain(fuzzyContentQuery(PLAN_SPACE_ID, '支付对账', 40));
    expect(plan).toContain('page_revisions_content_source_trgm_idx');
    expect(plan).toContain('Bitmap Index Scan');
  });
});
