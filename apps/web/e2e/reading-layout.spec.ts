import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('main').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('/');
}

async function createAndPublishPage(page: Page, path: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill('Responsive reading layout');
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  await page.locator('.cm-content').fill(
    '# A deliberately long document title that must never render underneath the share button\n\nIntroductory text.\n\n## Overview\n\nMore content.\n\n## Details\n\nAdditional content.',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/history/${path}?compare=1..2`);
  await page.getByRole('button', { name: /publish this revision/i }).first().click();
  await page.waitForURL(`/${path}`);
}

test.describe('reader responsive layout', () => {
  test('centers a narrower article and hides the sidebar before it constrains the reader', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await login(page);
    const path = `reading-layout-${Date.now()}`;
    await createAndPublishPage(page, path);

    const article = page.getByTestId('page-reader-article');
    const sidebar = page.getByRole('complementary', { name: 'Outline' });
    await expect(sidebar).toBeVisible();

    const wideLayout = await article.evaluate((element) => {
      const articleRect = element.getBoundingClientRect();
      const gridRect = element.parentElement!.getBoundingClientRect();
      const sidebarRect = document.querySelector<HTMLElement>('aside[aria-label="Outline"]')!.getBoundingClientRect();
      return {
        leftSpace: articleRect.left - gridRect.left,
        rightSpace: sidebarRect.left - articleRect.right,
        width: articleRect.width,
      };
    });
    expect(wideLayout.width).toBeLessThanOrEqual(1024);
    expect(Math.abs(wideLayout.leftSpace - wideLayout.rightSpace)).toBeLessThanOrEqual(1);

    const titleAndShareOverlap = await page.evaluate(() => {
      const heading = document.querySelector('.page-reader-article .prose > h1');
      const share = document.querySelector<HTMLButtonElement>('button[aria-label="Share"]');
      if (!heading || !share) return true;
      const range = document.createRange();
      range.selectNodeContents(heading);
      const shareRect = share.getBoundingClientRect();
      return Array.from(range.getClientRects()).some((rect) =>
        rect.left < shareRect.right && rect.right > shareRect.left && rect.top < shareRect.bottom && rect.bottom > shareRect.top,
      );
    });
    expect(titleAndShareOverlap).toBe(false);

    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(sidebar).toBeHidden();
    expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
