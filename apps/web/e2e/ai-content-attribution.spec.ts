import { test, expect } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

test('shows AI attribution to anonymous readers and changes it after a human edit', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await clickSignInSubmit(page);
  await page.waitForURL('/');

  const keyResponse = await page.request.post('/api/api-keys', {
    data: { name: `AI attribution ${Date.now()}`, scopes: ['view', 'create', 'edit'] },
  });
  expect(keyResponse.status()).toBe(201);
  const key = await keyResponse.json();
  const path = `ai-attribution-${Date.now()}`;
  const anonymous = await browser.newContext();
  try {
    const createdResponse = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${key.keySecret}` },
      data: { path, title: 'AI attribution example', contentSource: '# AI attribution example\n\nMachine content.' },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    expect(created.aiContentLevel).toBe('generated');
    const publication = await page.request.post(`/api/v1/pages/${created.id}/revisions/1/publication`, { data: {} });
    expect(publication.status()).toBe(200);

    const reader = await anonymous.newPage();
    await reader.goto(`/wiki/${path}`);
    const indicator = reader.getByTestId('page-provenance-indicators');
    await expect(indicator).toHaveText('AI generated');
    await expect(reader.locator('nav[aria-label="Breadcrumbs"]').getByTestId('page-provenance-indicators')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await page.locator('.cm-content').fill('# AI attribution example\n\nHuman reviewed content.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(`/h/${path}?compare=1..2`);
    await page.getByRole('button', { name: /publish this revision/i }).first().click();
    await page.waitForURL(`/wiki/${path}`);
    await reader.reload();
    await expect(indicator).toHaveText('AI assisted');

    const search = await page.request.get('/api/v1/search/pages', {
      headers: { Authorization: `Bearer ${key.keySecret}` },
      params: { q: 'AI attribution example', includeAiGenerated: 'false', includeAiAssisted: 'false' },
    });
    expect(search.status()).toBe(200);
    expect((await search.json()).items.some((item: { page: { id: string } }) => item.page.id === created.id)).toBe(false);

    const humanPath = `${path}-human`;
    const humanResponse = await page.request.post('/api/v1/pages', {
      data: { path: humanPath, title: 'Human example', contentSource: '# Human example' },
    });
    expect(humanResponse.status()).toBe(201);
    const human = await humanResponse.json();
    expect(human.aiContentLevel).toBeNull();
    expect((await page.request.post(`/api/v1/pages/${human.id}/revisions/1/publication`, { data: {} })).status()).toBe(200);
    await reader.goto(`/wiki/${humanPath}`);
    await expect(reader.getByTestId('page-provenance-indicators')).toHaveCount(0);
  } finally {
    await anonymous.close();
    await page.request.delete(`/api/api-keys/${key.id}`);
  }
});
