import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

const TOKENS = {
  lightColors: {
    primary: '#0ea5e9',
    'primary-text': '#ffffff',
    'primary-hover': '#0284c7',
    background: '#fafaf9',
    surface: '#ffffff',
    'surface-elevated': '#f5f5f4',
    border: '#e7e5e4',
    'border-strong': '#d6d3d1',
    muted: '#78716c',
    foreground: '#292524',
    ring: 'rgba(14, 165, 233, 0.25)',
    danger: '#dc2626',
    warning: '#d97706',
  },
  darkColors: {
    primary: '#f59e0b',
    'primary-text': '#1c1917',
    'primary-hover': '#d97706',
    background: '#1c1917',
    surface: '#292524',
    'surface-elevated': '#44403c',
    border: '#57534e',
    'border-strong': '#78716c',
    muted: '#a8a29e',
    foreground: '#f5f5f4',
    ring: 'rgba(245, 158, 11, 0.25)',
    danger: '#f87171',
    warning: '#fbbf24',
  },
  fonts: { body: 'source-sans-3', display: 'crimson-pro', mono: 'system-mono' },
  fontSizes: { base: '1rem', h1: '2.25rem', h2: '1.75rem', h3: '1.375rem' },
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

test.describe('user reading theme', () => {
  test('user changes the primary color and it applies inside .prose', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await page.request.put('/api/user/appearance', { data: TOKENS });
    expect(response.ok()).toBe(true);

    await page.goto('/');
    const css = await page.locator('#app-reading-theme').innerText();
    expect(css).toContain('--color-primary:#0ea5e9');
  });

  test('reset returns defaults and removes the reading-theme stylesheet', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const put = await page.request.put('/api/user/appearance', { data: TOKENS });
    expect(put.ok()).toBe(true);

    const del = await page.request.delete('/api/user/appearance');
    expect(del.ok()).toBe(true);
    const body = await del.json();
    expect(body.isCustomized).toBe(false);

    // The #app-reading-theme <style> tag is always rendered in the root layout
    // (so it can be filled in without a layout shift); reset makes its content
    // empty rather than removing the element itself.
    await page.goto('/');
    const css = await page.locator('#app-reading-theme').innerText();
    expect(css.trim()).toBe('');
  });
});
