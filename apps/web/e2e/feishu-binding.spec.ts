import { test, expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

// The Feishu integration stores all state in Postgres. These tests seed a
// single-use binding token directly (as the SDK event handler would) and drive the
// authenticated confirmation page, then assert the binding via the database.
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';

function sql() {
  return postgres(E2E_DATABASE_URL, { max: 1 });
}

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function seedToken(openId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = sql();
  try {
    await db`
      INSERT INTO feishu_binding_tokens (token_hash, open_id, expires_at)
      VALUES (${tokenHash}, ${openId}, ${new Date(Date.now() + 10 * 60 * 1000)})
    `;
  } finally {
    await db.end({ timeout: 5 });
  }
  return token;
}

async function activeBindingCount(openId: string): Promise<number> {
  const db = sql();
  try {
    const rows = await db`
      SELECT count(*)::int AS n FROM feishu_bindings
      WHERE open_id = ${openId} AND status = 'active'
    `;
    return rows[0]?.n ?? 0;
  } finally {
    await db.end({ timeout: 5 });
  }
}

test('shows a missing-token message when opened without a token', async ({ page }) => {
  await register(page, `feishu-bind-${Date.now()}@example.com`, 'Password123!');
  await page.goto('/user-center/feishu/bind');
  await expect(page.getByText(/missing its connection token/i)).toBeVisible();
});

test('confirms a binding from a valid single-use token', async ({ page }) => {
  const email = `feishu-bind-${Date.now()}@example.com`;
  const openId = `ou_e2e_${Date.now()}`;
  await register(page, email, 'Password123!');
  const token = await seedToken(openId);

  await page.goto(`/user-center/feishu/bind?token=${encodeURIComponent(token)}`);
  await page.getByRole('button', { name: /confirm connection/i }).click();
  await expect(page.getByText(/your feishu account is now connected/i)).toBeVisible();

  expect(await activeBindingCount(openId)).toBe(1);
});

test('rejects reusing an already-consumed token', async ({ page }) => {
  const email = `feishu-bind-${Date.now()}@example.com`;
  const openId = `ou_e2e_reuse_${Date.now()}`;
  await register(page, email, 'Password123!');
  const token = await seedToken(openId);

  await page.goto(`/user-center/feishu/bind?token=${encodeURIComponent(token)}`);
  await page.getByRole('button', { name: /confirm connection/i }).click();
  await expect(page.getByText(/now connected/i)).toBeVisible();

  // Reload and try again with the same (now-consumed) token.
  await page.goto(`/user-center/feishu/bind?token=${encodeURIComponent(token)}`);
  await page.getByRole('button', { name: /confirm connection/i }).click();
  await expect(page.getByText(/invalid, expired, or already used/i)).toBeVisible();
});
