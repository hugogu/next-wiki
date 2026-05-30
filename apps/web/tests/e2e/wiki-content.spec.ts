import { test, expect } from "@playwright/test";

// T016: End-to-end authoring, move, search, and restore journey.
// These tests run against the full running application.

test.describe("Wiki content authoring journey", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the wiki and ensure we have an authenticated session.
    // For now these are skeletons — full implementation in Phase 7 when
    // the complete auth + content stack is available.
    await page.goto("/");
  });

  test("setup page renders when wiki is uninitialized", async ({ page }) => {
    // On a fresh install, /setup should render the setup wizard.
    await page.goto("/setup");
    await expect(page.getByText("Welcome to next-wiki")).toBeVisible();
  });

  test("healthz endpoint returns ok", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("readyz endpoint returns ready", async ({ request }) => {
    const res = await request.get("/readyz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
  });

  // Placeholder journeys — expanded in Phase 7:
  test.skip("editor: create page, tag it, move it, restore earlier revision", async ({ page }) => {
    // 1. Sign in as editor
    // 2. Create new page with Markdown + Mermaid
    // 3. Add tags
    // 4. Move page to new path — verify redirect exists
    // 5. Edit page — verify revision history grows
    // 6. Restore earlier revision — verify content reverts
  });

  test.skip("search: keyword and tag filtering find the page", async ({ page }) => {
    // 1. Create a page with distinctive content
    // 2. Search by keyword — verify page appears
    // 3. Filter by tag — verify page appears
  });
});
