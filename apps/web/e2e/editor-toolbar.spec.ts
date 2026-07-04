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

function longMarkdown(paragraphs: number) {
  return Array.from({ length: paragraphs }, (_, i) => `## Section ${i}\n\nParagraph content for section ${i}.`).join(
    '\n\n',
  );
}

async function waitForBothPanesScrollable(page: Page) {
  await page.waitForFunction(() => {
    const scroller = document.querySelector('.cm-scroller');
    const preview = document.querySelector('[data-testid="editor-preview-pane"]');
    return (
      !!scroller &&
      !!preview &&
      scroller.scrollHeight > scroller.clientHeight * 1.5 &&
      preview.scrollHeight > preview.clientHeight * 1.5
    );
  });
}

test.describe('editor toolbar toggles', () => {
  test('wrap toggle flips state and persists across reload', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    const wrapButton = page.getByRole('button', { name: 'Toggle line wrap' });
    await expect(wrapButton).toHaveAttribute('aria-pressed', 'true');

    await wrapButton.click();
    await expect(wrapButton).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Toggle line wrap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('scroll sync toggle disables and re-enables cross-pane scrolling', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');
    await page.locator('.cm-content').fill(longMarkdown(150));

    const editorScroller = page.locator('.cm-scroller');
    const preview = page.getByTestId('editor-preview-pane');

    await waitForBothPanesScrollable(page);

    await page.getByRole('button', { name: 'Toggle scroll sync' }).click();
    const before = await preview.evaluate((el) => el.scrollTop);
    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await editorScroller.dispatchEvent('scroll');
    await page.waitForTimeout(200);
    expect(await preview.evaluate((el) => el.scrollTop)).toBe(before);

    await page.getByRole('button', { name: 'Toggle scroll sync' }).click();
    await editorScroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await editorScroller.dispatchEvent('scroll');
    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await editorScroller.dispatchEvent('scroll');
    await page.waitForTimeout(200);
    expect(await preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });

  test('scrolling the editor moves the preview to a roughly matching position', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');
    await page.locator('.cm-content').fill(longMarkdown(150));

    const editorScroller = page.locator('.cm-scroller');
    const preview = page.getByTestId('editor-preview-pane');

    await waitForBothPanesScrollable(page);

    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight * 0.5;
    });
    await editorScroller.dispatchEvent('scroll');
    await page.waitForTimeout(200);

    const ratio = await preview.evaluate((el) => el.scrollTop / (el.scrollHeight - el.clientHeight));
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });
});
