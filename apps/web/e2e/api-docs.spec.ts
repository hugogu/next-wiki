import { test, expect } from '@playwright/test';

test.describe('api docs', () => {
  test('serves openapi.json and renders the interactive docs without login', async ({ page }) => {
    const response = await page.request.get('/api/openapi.json');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths['/pages']).toBeDefined();
    for (const path of [
      '/ai/settings',
      '/ai/providers',
      '/ai/entitlements/{userId}',
      '/ai/indexes',
      '/ai/actions/{id}/events',
      '/ai/searches',
      '/ai/questions',
      '/ai/optimizations',
      '/ai/images',
      '/ai/generated-artifacts/{id}/asset',
    ]) {
      expect(body.paths[path], `OpenAPI path ${path}`).toBeDefined();
    }

    await page.goto('/api-docs', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/api-docs');
    await expect(page.locator('.scalar-api-reference').first()).toBeVisible();
    await expect(page.locator('text=Next Wiki API').first()).toBeVisible();
    await expect(page.locator('text=Authentication').first()).toBeVisible();

    const docsSidebar = page.getByRole('navigation', { name: 'Sidebar for Next Wiki API' });
    const docsContent = page.getByRole('main', {
      name: 'Open API Documentation for Next Wiki API',
    });
    await expect(docsSidebar).toBeVisible();
    await expect(docsContent).toBeVisible();

    const sidebarBox = await docsSidebar.boundingBox();
    const contentBox = await docsContent.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(sidebarBox!.width).toBeGreaterThan(200);
    expect(contentBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
  });
});
