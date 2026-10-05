import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { clickSignInSubmit } from './test-helpers';

/**
 * A page's Markdown export is its reader address plus `.md`. Slug routing (035)
 * made the reader address independent of the tree path, so the export has to
 * resolve the way the HTML reader does — by slug and by alias — while `.md`
 * links made before that (by tree path) keep working. The export is
 * anonymous-only, so every request here uses the session-less `request`
 * fixture: exactly what an agent or crawler sees.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function createPage(
  page: Page,
  input: { path: string; slug: string; title: string; contentSource: string },
): Promise<string> {
  const response = await page.request.post('/api/v1/pages', { data: input });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

async function publish(page: Page, id: string) {
  const response = await page.request.post(`/api/v1/pages/${id}/revisions/1/publication`, { data: {} });
  expect(response.status()).toBe(200);
}

async function restrictToRegisteredReaders(id: string) {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    await sql`UPDATE pages SET visibility = 'registered' WHERE id = ${id}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test.describe('Markdown export (.md)', () => {
  test('serves a page at its slug, a manual alias, and its legacy tree path', async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const path = `md-export-${stamp}/guides/setup`;
    const slug = `md-export-setup-${stamp}`;
    const alias = `md-export-alias-${stamp}`;
    const marker = `Markdown export marker ${stamp}`;

    await login(page);
    const id = await createPage(page, {
      path,
      slug,
      title: 'Markdown export',
      contentSource: `# Markdown export\n\n${marker}\n`,
    });
    try {
      await publish(page, id);
      const aliasResponse = await page.request.post(`/api/v1/pages/${id}/addresses`, { data: { address: alias } });
      expect(aliasResponse.status()).toBe(201);

      // Reader address + `.md` — what an agent has after reading the page's URL.
      const bySlug = await request.get(`/wiki/${slug}.md`);
      expect(bySlug.status()).toBe(200);
      expect(bySlug.headers()['content-type']).toContain('text/markdown');
      const source = await bySlug.text();
      expect(source).toContain(marker);

      // An alias serves the page directly, with the same source.
      const byAlias = await request.get(`/wiki/${alias}.md`);
      expect(byAlias.status()).toBe(200);
      expect(await byAlias.text()).toBe(source);

      // Links made before slug routing named the page by its tree path.
      const byTreePath = await request.get(`/${path}.md`);
      expect(byTreePath.status()).toBe(200);
      expect(await byTreePath.text()).toBe(source);
    } finally {
      await page.request.delete(`/api/v1/pages/${id}`);
    }
  });

  test('does not expose drafts, registered-only pages, or unknown addresses', async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();

    await login(page);
    const draftSlug = `md-export-draft-${stamp}`;
    const draftId = await createPage(page, {
      path: `md-export-draft-${stamp}`,
      slug: draftSlug,
      title: 'Unpublished draft',
      contentSource: '# Unpublished draft\n\nNot yet public.\n',
    });
    const membersSlug = `md-export-members-${stamp}`;
    const membersId = await createPage(page, {
      path: `md-export-members-${stamp}`,
      slug: membersSlug,
      title: 'Members only',
      contentSource: '# Members only\n\nRegistered readers only.\n',
    });
    try {
      await publish(page, membersId);
      await restrictToRegisteredReaders(membersId);

      expect((await request.get(`/wiki/${draftSlug}.md`)).status()).toBe(404);
      expect((await request.get(`/wiki/${membersSlug}.md`)).status()).toBe(403);
      expect((await request.get(`/wiki/md-export-missing-${stamp}.md`)).status()).toBe(404);
    } finally {
      await page.request.delete(`/api/v1/pages/${draftId}`);
      await page.request.delete(`/api/v1/pages/${membersId}`);
    }
  });

  // Next hands the route already-decoded segments, so a literal `%` (sent as
  // `%25`) used to be decoded a second time and answered 500 instead of 404.
  test('answers 404, not 500, for an address containing a literal percent sign', async ({ request }) => {
    const stamp = Date.now();

    expect((await request.get(`/wiki/md-export-%25zz-${stamp}.md`)).status()).toBe(404);
    expect((await request.get(`/md-export-%25zz-${stamp}.md`)).status()).toBe(404);
  });
});
