import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { clickSignInSubmit } from './test-helpers';

/**
 * Bulk page visibility from the Admin page list: filter, select, change, and
 * confirm that anonymous readers are refused (and let in again). Pages are
 * seeded straight into the database under a folder unique to this run.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const RUN = Date.now().toString(36);
const FOLDER = `e2e-bulk-visibility-${RUN}`;
const FEED_PAGES = 55;

type Seed = { path: string; title: string; visibility: 'public' | 'registered' | 'restricted'; published: boolean };

const SEEDS: Seed[] = [
  { path: `${FOLDER}/curated/a`, title: `Bulk curated A ${RUN}`, visibility: 'public', published: true },
  { path: `${FOLDER}/curated/b`, title: `Bulk curated B ${RUN}`, visibility: 'public', published: true },
  { path: `${FOLDER}/curated/c`, title: `Bulk curated C ${RUN}`, visibility: 'restricted', published: true },
  { path: `${FOLDER}/curated/draft`, title: `Bulk curated draft ${RUN}`, visibility: 'restricted', published: false },
  ...Array.from({ length: FEED_PAGES }, (_, index): Seed => {
    const day = String(index + 1).padStart(2, '0');
    return { path: `${FOLDER}/feed/day-${day}`, title: `Bulk feed day ${day} ${RUN}`, visibility: 'public', published: true };
  }),
];

function database() {
  return postgres(E2E_DATABASE_URL, { max: 1 });
}

async function clearSeeds() {
  const sql = database();
  try {
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE path LIKE ${`${FOLDER}/%`})`;
    await sql`DELETE FROM pages WHERE path LIKE ${`${FOLDER}/%`}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedPages() {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'default'`;
    for (const seed of SEEDS) {
      const [page] = await sql<{ id: string }[]>`
        INSERT INTO pages (space_id, slug, path, title, author_id, visibility)
        VALUES (${space!.id}, ${seed.path}, ${seed.path}, ${seed.title}, ${admin!.id}, ${seed.visibility})
        RETURNING id`;
      const source = `# ${seed.title}\n\nBody of ${seed.title}.`;
      const [revision] = await sql<{ id: string }[]>`
        INSERT INTO page_revisions (page_id, version_number, content_source, content_html, content_hash, author_id, status, published_at)
        VALUES (${page!.id}, 1, ${source}, ${`<h1>${seed.title}</h1><p>Body of ${seed.title}.</p>`},
                ${createHash('sha256').update(source).digest('hex')}, ${admin!.id},
                ${seed.published ? 'published' : 'draft'}, ${seed.published ? new Date() : null})
        RETURNING id`;
      await sql`
        UPDATE pages
        SET latest_version_id = ${revision!.id}, current_published_version_id = ${seed.published ? revision!.id : null}
        WHERE id = ${page!.id}`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function visibilityByPath(prefix: string): Promise<Record<string, number>> {
  const sql = database();
  try {
    const rows = await sql<{ visibility: string; pages: number }[]>`
      SELECT visibility, count(*)::int AS pages FROM pages
      WHERE path LIKE ${`${prefix}/%`} AND deleted_at IS NULL
      GROUP BY visibility`;
    return Object.fromEntries(rows.map((row) => [row.visibility, row.pages]));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

/** A click on a server-rendered control before React attaches its handler is lost. */
async function waitForHydration(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactProps$'))))
    .toBe(true);
}

function seed(path: string): Seed {
  const found = SEEDS.find((candidate) => candidate.path === `${FOLDER}/${path}`);
  if (!found) throw new Error(`no seed ${path}`);
  return found;
}

/** Opens a page as an anonymous visitor, at the reader address the Admin list links it to. */
async function readAnonymously(browser: Browser, page: Page, target: Seed) {
  await page.goto(`/admin/pages?folder=${target.path}`);
  const href = await page.getByRole('link', { name: target.title, exact: true }).getAttribute('href');
  const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const reader = await anonymous.newPage();
  await reader.goto(href!);
  return { reader, close: () => anonymous.close() };
}

test.describe('Admin bulk page visibility', () => {
  test.beforeEach(async () => {
    await clearSeeds();
    await seedPages();
  });

  test.afterAll(async () => {
    await clearSeeds();
  });

  test('filters by visibility, restricts the selected pages, and anonymous readers are refused', async ({ page, browser }) => {
    await loginAsAdmin(page);
    const before = await readAnonymously(browser, page, seed('curated/a'));
    await expect(before.reader.getByRole('main')).toContainText(`Body of Bulk curated A ${RUN}.`);
    await before.close();

    await page.goto('/admin/pages');
    await page.getByLabel('Folder', { exact: true }).fill(`${FOLDER}/curated`);
    await page.getByLabel('Visibility', { exact: true }).selectOption('public');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.waitForURL(/visibility=public/);

    const rows = page.getByRole('row').filter({ hasText: RUN });
    await expect(rows).toHaveCount(2);
    for (const title of [`Bulk curated A ${RUN}`, `Bulk curated B ${RUN}`]) {
      await expect(page.getByRole('row', { name: new RegExp(title) }).getByText('Public', { exact: true })).toBeVisible();
    }

    const selectA = page.getByRole('checkbox', { name: `Select Bulk curated A ${RUN}` });
    await waitForHydration(selectA);
    await selectA.check();
    await page.getByRole('checkbox', { name: `Select Bulk curated B ${RUN}` }).check();
    await expect(page.getByText('2 pages selected')).toBeVisible();

    await page.getByRole('button', { name: 'Set visibility…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set page visibility' });
    await expect(dialog.getByRole('radio', { name: 'Selected pages (2)' })).toBeChecked();
    await dialog.getByRole('combobox').selectOption('restricted');
    await expect(dialog.getByText('2 pages in scope, 2 of them will change.')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Change 2 pages' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Changed 2 pages to Restricted.')).toBeVisible();
    await expect(page.getByText('No pages match the current filters.')).toBeVisible();
    expect(await visibilityByPath(`${FOLDER}/curated`)).toEqual({ restricted: 4 });

    const after = await readAnonymously(browser, page, seed('curated/a'));
    await expect(after.reader.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(after.reader.getByRole('main')).not.toContainText(`Body of Bulk curated A ${RUN}.`);
    await after.close();
  });

  test('changes a whole folder of 50+ pages in one action and warns before pages become public', async ({ page, browser }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/pages?folder=${FOLDER}/feed`);

    const open = page.getByRole('button', { name: 'Set visibility…' });
    await waitForHydration(open);
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Set page visibility' });
    await expect(dialog.getByRole('radio', { name: `Every page in Wiki under ${FOLDER}/feed` })).toBeChecked();
    await dialog.getByRole('combobox').selectOption('restricted');
    await expect(dialog.getByText(`${FEED_PAGES} pages in scope, ${FEED_PAGES} of them will change.`)).toBeVisible();
    await dialog.getByRole('button', { name: `Change ${FEED_PAGES} pages` }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Changed ${FEED_PAGES} pages to Restricted.`)).toBeVisible();
    expect(await visibilityByPath(`${FOLDER}/feed`)).toEqual({ restricted: FEED_PAGES });
    const refused = await readAnonymously(browser, page, seed('feed/day-01'));
    await expect(refused.reader.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(refused.reader.getByRole('main')).not.toContainText(`Body of Bulk feed day 01 ${RUN}.`);
    await refused.close();

    // The whole run folder now holds the restricted feed, one restricted
    // curated page and a restricted page that was never published.
    await page.goto(`/admin/pages?folder=${FOLDER}`);
    await waitForHydration(open);
    await open.click();
    await dialog.getByRole('combobox').selectOption('public');
    const pending = FEED_PAGES + 2;
    const warning = dialog.getByRole('alert');
    await expect(warning).toContainText(`${pending} pages will become readable by anyone, without signing in.`);
    await expect(warning).toContainText(`${pending} of them are restricted now, so only administrators can read them today.`);
    await expect(warning).toContainText('1 of them has never been published; it becomes public as soon as it is published.');
    await dialog.getByRole('button', { name: `Change ${pending} pages` }).click();

    await expect(page.getByText(`Changed ${pending} pages to Public.`)).toBeVisible();
    expect(await visibilityByPath(FOLDER)).toEqual({ public: SEEDS.length });
    const readable = await readAnonymously(browser, page, seed('feed/day-01'));
    await expect(readable.reader.getByRole('main')).toContainText(`Body of Bulk feed day 01 ${RUN}.`);
    await readable.close();
  });
});
