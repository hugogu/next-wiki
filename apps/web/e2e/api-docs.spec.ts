import { test, expect } from '@playwright/test';

test.describe('api docs', () => {
  test('serves openapi.json and renders the interactive docs without login', async ({ page }) => {
    const response = await page.request.get('/api/openapi.json');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths['/pages']).toBeDefined();

    await page.goto('/api-docs', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/api-docs');
    await expect(page.locator('.scalar-api-reference').first()).toBeVisible();
    await expect(page.locator('text=Next Wiki API').first()).toBeVisible();
    await expect(page.locator('text=Authentication').first()).toBeVisible();
  });
});
