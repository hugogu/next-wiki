import { test, expect } from '@playwright/test';

/**
 * Next 16 hands page components percent-encoded params but `generateMetadata`
 * and route handlers already-decoded ones. Code that decoded every param
 * unconditionally therefore decoded a literal `%` (sent as `%25`) a second
 * time, and `decodeURIComponent` threw a URIError. Requests use the
 * session-less `request` fixture: what a crawler or scanner sends.
 */
test.describe('literal percent sign in URLs', () => {
  // A throwing `generateMetadata` leaves the page without any <title>, while
  // the page body (whose params decode once) still renders.
  test('a tag page keeps the name in its title', async ({ request }) => {
    const response = await request.get('/tags/a%25zz');

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<title>a%zz · ');
  });

  test('the space Markdown export answers 403 to an anonymous client, not 500', async ({ request }) => {
    const response = await request.get('/spaces/raw/a%25zz.md');

    expect(response.status()).toBe(403);
  });
});
