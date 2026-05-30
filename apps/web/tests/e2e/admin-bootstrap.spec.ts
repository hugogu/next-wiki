import { test, expect } from "@playwright/test";

// T030: Admin bootstrap and permissions smoke journey.

test.describe("Admin bootstrap journey", () => {
  test("setup page is accessible on fresh install", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByText("Welcome to next-wiki")).toBeVisible();
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("admin route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/admin");
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip("full setup → login → admin journey", async ({ page }) => {
    // 1. Complete first-run setup
    // 2. Sign in as admin
    // 3. Visit /admin — verify dashboard shows user/group counts
    // 4. Visit /admin/users — verify admin user appears
    // 5. Visit /admin/tasks — verify task list renders
    // Expanded in Phase 7 when test fixtures are available.
  });
});
