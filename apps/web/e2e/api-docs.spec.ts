import { test, expect } from '@playwright/test';

test.describe('api docs', () => {
  test('serves openapi.json and renders the interactive docs without login', async ({ page }) => {
    const response = await page.request.get('/api/openapi.json');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths['/v1/pages']).toBeDefined();
    expect(body.paths['/v1/search/pages'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'q', in: 'query', required: true }),
        expect.objectContaining({ name: 'scope', in: 'query' }),
        expect.objectContaining({ name: 'status', in: 'query' }),
      ]),
    );
    expect(body.paths['/v1/search/pages'].get.responses['200'].content['application/json'].schema.$ref).toBe(
      '#/components/schemas/PublicPageSearchResponse',
    );
    expect(body.paths['/v1/pages'].post.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/PublicPageCreateInput',
    );
    expect(body.paths['/v1/pages/{id}'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          in: 'path',
          schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
        }),
      ]),
    );
    expect(body.paths['/v1/pages'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'space', in: 'query' }),
        expect.objectContaining({ name: 'filterType', in: 'query' }),
        expect.objectContaining({ name: 'filter[tag]', in: 'query' }),
        expect.objectContaining({ name: 'createdStart', in: 'query' }),
        expect.objectContaining({ name: 'createdEnd', in: 'query' }),
      ]),
    );
    expect(body.paths['/v1/pages/{id}/appends'].post.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/PublicRawAppendInput',
    );
    expect(body.paths['/settings/writing-mode/jobs/{id}'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          in: 'path',
          schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
        }),
      ]),
    );
    expect(body.paths['/v1/pages/{id}/revisions/{version}'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'version',
          in: 'path',
          schema: expect.objectContaining({ type: 'integer' }),
        }),
      ]),
    );
    // contentSource defaults to '' (optional) — an empty draft is a valid create.
    expect(body.components.schemas.PublicPageCreateInput.required).toEqual(
      expect.arrayContaining(['path', 'title']),
    );
    // `path` is a $ref to the shared PublicPagePath schema rather than an inline type.
    expect(body.components.schemas.PublicPageCreateInput.properties).toEqual(
      expect.objectContaining({
        path: expect.objectContaining({ $ref: expect.stringContaining('PublicPagePath') }),
        title: expect.objectContaining({ type: 'string' }),
        contentSource: expect.objectContaining({ type: 'string' }),
      }),
    );
    expect(body.components.schemas.PublicPagePath.type).toBe('string');
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

    const publicResponse = await page.request.get('/api/public-openapi.json');
    expect(publicResponse.status()).toBe(200);
    const publicBody = await publicResponse.json();
    expect(Object.keys(publicBody.paths).every((path) => path.startsWith('/v1/'))).toBe(true);
    expect(publicBody.paths['/v1/pages']).toBeDefined();
    expect(publicBody.paths['/v1/search/pages']).toBeDefined();
    expect(publicBody.paths['/ai/settings']).toBeUndefined();
    expect(publicBody.paths['/pages']).toBeUndefined();
    expect(publicBody.components.schemas.PublicPageCreateInput.properties).toEqual(
      expect.objectContaining({
        path: expect.objectContaining({ $ref: expect.stringContaining('PublicPagePath') }),
        title: expect.objectContaining({ type: 'string' }),
        contentSource: expect.objectContaining({ type: 'string' }),
      }),
    );

    await page.goto('/api-docs', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/api-docs');
    await expect(page.locator('.scalar-api-reference').first()).toBeVisible();
    await expect(page.locator('text=Next Wiki Public API').first()).toBeVisible();
    await expect(page.locator('text=Authentication').first()).toBeVisible();

    const docsSidebar = page.getByRole('navigation', { name: 'Sidebar for Next Wiki Public API' });
    const docsContent = page.getByRole('main', {
      name: 'Open API Documentation for Next Wiki Public API',
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
