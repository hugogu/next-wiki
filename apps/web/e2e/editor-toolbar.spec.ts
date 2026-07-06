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

let pageCounter = 0;

async function createPage(page: Page, title: string): Promise<string> {
  const path = `editor-toolbar-${Date.now()}-${pageCounter++}`;
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  return path;
}

function longMarkdown(paragraphs: number) {
  return Array.from({ length: paragraphs }, (_, i) => `## Section ${i}\n\nParagraph content for section ${i}.`).join(
    '\n\n',
  );
}

// A GitHub-flavored table: one source line per row, but each row renders as a
// tall padded block, so the preview ends up much taller than the source.
function tableMarkdown(rows: number) {
  const header = '| Column A | Column B |\n| --- | --- |';
  const body = Array.from({ length: rows }, (_, i) => `| cell ${i}a | cell ${i}b |`).join('\n');
  return `${header}\n${body}`;
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
    await createPage(page, 'Editor Toolbar Test');

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
    await createPage(page, 'Editor Toolbar Test');
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
    await createPage(page, 'Editor Toolbar Test');
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

  test('scrolling the editor to the bottom lands the preview at its bottom too', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, 'Editor Toolbar Test');
    // Tables render much taller than their source, so the two panes have very
    // different total heights — the case where naive top-alignment leaves the
    // (taller) preview short of its bottom when the editor is scrolled to the end.
    await page.locator('.cm-content').fill(longMarkdown(120) + '\n\n' + tableMarkdown(40));

    const editorScroller = page.locator('.cm-scroller');
    const preview = page.getByTestId('editor-preview-pane');

    await waitForBothPanesScrollable(page);

    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    });
    await editorScroller.dispatchEvent('scroll');
    await page.waitForTimeout(200);

    const distanceFromBottom = await preview.evaluate(
      (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
    );
    expect(distanceFromBottom).toBeLessThan(4);
  });

  test('clicking a line in the editor drives the preview position', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, 'Editor Toolbar Test');
    await page.locator('.cm-content').fill(longMarkdown(150));

    const preview = page.getByTestId('editor-preview-pane');
    await waitForBothPanesScrollable(page);

    // Both panes start at the top; clicking a line well down the visible editor
    // should pull the preview down to keep that line aligned across panes.
    expect(await preview.evaluate((el) => el.scrollTop)).toBe(0);
    await page.locator('.cm-content').click({ position: { x: 40, y: 520 } });
    await page.waitForTimeout(200);
    expect(await preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
  });
});
