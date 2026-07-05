import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

// The stylesheet field is a CodeMirror editor (see CssEditor.tsx), not a plain
// textarea: `aria-label` lands on the wrapper div, so reading/writing content
// goes through the CodeMirror content element rather than .toHaveValue()/.fill().
const SELECT_ALL_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('admin system themes', () => {
  test('admin sees built-ins, copies, edits, and activates a custom theme', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance/system');

    await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: /Wiki.js-inspired/ }).click();
    await expect(page.getByText('Built-in themes are read-only.')).toBeVisible();
    const stylesheetEditor = page.getByLabel('Theme stylesheet').locator('.cm-content');
    await expect(stylesheetEditor).toContainText('font-size');

    await page.getByRole('button', { name: 'Copy to edit' }).click();
    await expect(page.getByText('Copy created.')).toBeVisible();

    await page.getByLabel('Theme name').fill('My System Theme');
    await stylesheetEditor.click();
    await page.keyboard.press(`${SELECT_ALL_MODIFIER}+a`);
    await page.keyboard.type('h1 { font-size: 3rem; }');
    await expect(stylesheetEditor).toContainText('h1 { font-size: 3rem; }');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Theme saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText('Theme activated.')).toBeVisible();
  });
});
