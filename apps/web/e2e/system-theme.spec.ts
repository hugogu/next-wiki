import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('main').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

// The stylesheet field is a CodeMirror editor (see CssEditor.tsx), not a plain
// textarea: `aria-label` lands on the wrapper div, so reading/writing content
// goes through the CodeMirror content element. Playwright's locator.fill()
// handles clearing + typing on the contenteditable atomically, unlike a manual
// click + select-all + keyboard.type() sequence which can race with the app's
// own async re-sync of the editor value after a "copy to edit" navigation.

test.describe('admin system themes', () => {
  test('admin sees built-ins, copies, edits, and activates a custom theme', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();

    // Exact match: a leftover "<name> copy" theme from a previous retry would
    // otherwise make a substring/regex match on the built-in's name ambiguous.
    await page.getByRole('button', { name: 'Wiki.js-inspired(built-in)', exact: true }).click();
    await expect(page.getByText('Built-in themes are read-only.')).toBeVisible();
    const stylesheetEditor = page.getByLabel('Theme stylesheet').locator('.cm-content');
    await expect(stylesheetEditor).toContainText('font-size');

    // Copy directly from the theme list row (no need to scroll to the editor).
    await page.getByRole('button', { name: 'Copy to edit: Wiki.js-inspired' }).click();
    await expect(page.getByText('Copy created.')).toBeVisible();

    await page.getByLabel('Theme name').fill('My System Theme');
    await stylesheetEditor.fill('h1 { font-size: 3rem; }');
    await expect(stylesheetEditor).toContainText('h1 { font-size: 3rem; }');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Theme saved.')).toBeVisible();

    // Enable via the toggle next to the theme title.
    await page.getByRole('switch', { name: 'Enable this theme' }).click();
    await expect(page.getByText('Theme activated.')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Enable this theme' })).toBeChecked();
  });
});
