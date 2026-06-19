import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

async function openUserCenter(page: Page) {
  await page.goto('/user-center/profile');
  await expect(page.getByTestId('page-title')).toHaveText('Profile');
}

async function logout(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /user center/i }).click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL('/');
  await page.waitForLoadState('networkidle');
}

test.describe('user center profile and preferences', () => {
  test('updates profile, email, password, and preferences and persists across sessions', async ({ page, browser }) => {
    const timestamp = Date.now();
    const initialEmail = `user-center-${timestamp}@example.com`;
    const newEmail = `user-center-${timestamp}-new@example.com`;
    const initialPassword = 'Password123!';
    const newPassword = 'NewPassword456!';
    const displayName = `Tester ${timestamp}`;

    await register(page, initialEmail, initialPassword);
    await openUserCenter(page);

    // Update display name.
    await page.getByLabel('Display name', { exact: true }).fill(displayName);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Profile updated.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(displayName);

    // Change email and re-login with new email.
    await page.getByLabel('Email', { exact: true }).fill(newEmail);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Profile updated.')).toBeVisible();
    await logout(page);
    await login(page, newEmail, initialPassword);

    // Change password.
    await openUserCenter(page);
    await page.getByRole('link', { name: 'Password' }).click();
    await page.getByLabel('Current password', { exact: true }).fill(initialPassword);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password updated.')).toBeVisible();
    await logout(page);
    await login(page, newEmail, newPassword);

    // Set preferences (dark theme, Chinese locale).
    await openUserCenter(page);
    await page.getByText('Dark', { exact: true }).click();
    await page.getByText('中文', { exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Profile updated|个人资料已更新/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Verify preferences persist across refresh.
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('heading', { name: '显示偏好' })).toBeVisible();

    // Verify preferences persist in a fresh browser context.
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    await login(newPage, newEmail, newPassword);
    await newPage.waitForLoadState('networkidle');
    await newPage.goto('/user-center/profile');
    await expect(newPage.locator('html')).toHaveClass(/dark/);
    await expect(newPage.getByRole('heading', { name: '显示偏好' })).toBeVisible();
    await newContext.close();
  });
});
