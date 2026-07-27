import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function registerReader(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('Admin AI Skills', () => {
  test('ships three built-in skills, enabled, on a fresh install', async ({ page }) => {
    await login(page);
    await page.goto('/admin/ai/skills');

    for (const name of ['wiki-writer', 'wiki-tagger', 'wiki-linker']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
    // Built-in, enabled, no configuration required (FR-044, SC-008).
    await expect(page.getByRole('switch', { name: /wiki-writer/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('disabling a skill persists and removes it from the catalogue offered to the model', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/admin/ai/skills');

    const toggle = page.getByRole('switch', { name: /wiki-tagger/ });
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/skills/wiki-tagger') &&
          response.request().method() === 'PATCH',
      ),
      toggle.click(),
    ]);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const listing = await page.request.get('/api/ai/skills');
    expect(listing.ok()).toBe(true);
    const body = (await listing.json()) as { skills: Array<{ name: string; enabled: boolean }> };
    expect(body.skills.find((skill) => skill.name === 'wiki-tagger')?.enabled).toBe(false);

    // Restore so the ordering of tests cannot leak state.
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PATCH'),
      toggle.click(),
    ]);
  });

  test('browses a skill, edits it, and resets it to the shipped default', async ({ page }) => {
    await login(page);
    await page.goto('/admin/ai/skills/wiki-linker');

    // Instruction file leads the tree and opens by default.
    await expect(page.getByRole('button', { name: 'SKILL.md' })).toBeVisible();
    await expect(page.getByText('name: "wiki-linker"')).toBeVisible();

    // A script is browsable and labelled as reference material that is never run.
    await page.getByRole('button', { name: 'scripts/find_linkable.py' }).click();
    await expect(page).toHaveURL(/file=scripts%2Ffind_linkable\.py/);
    await expect(page.getByText(/does not execute skill scripts/i)).toBeVisible();

    // Edit the instruction file through the API the editor uses, then confirm
    // the catalogue reports the override.
    const current = await page.request.get(
      '/api/ai/skills/wiki-linker/files?path=SKILL.md',
    );
    const file = (await current.json()) as { content: string; revision: number | null };
    // A built-in that has never been edited has no revision yet: there is
    // nothing to conflict with, so the first write omits the token.
    expect(file.revision).toBeNull();
    const written = await page.request.put('/api/ai/skills/wiki-linker/files?path=SKILL.md', {
      data: { content: `${file.content}\n\n## E2E marker\n` },
    });
    expect(written.ok()).toBe(true);
    const overridden = (await written.json()) as { revision: number };
    expect(overridden.revision).toBe(1);

    await page.reload();
    await expect(page.getByText('Edited')).toBeVisible();

    // Now that an override exists, a stale revision is refused rather than
    // overwriting a colleague's save.
    const stale = await page.request.put('/api/ai/skills/wiki-linker/files?path=SKILL.md', {
      data: { content: file.content, revision: 99 },
    });
    expect(stale.status()).toBe(409);

    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset to default' }).click();

    await expect(page.getByText('Edited')).toBeHidden();
    const restored = await page.request.get('/api/ai/skills/wiki-linker/files?path=SKILL.md');
    expect((await restored.json()).content).not.toContain('E2E marker');
  });

  test('reports a missing skills mount as a notice, not a failure', async ({ page }) => {
    await login(page);
    await page.goto('/admin/ai/skills');
    // The default deployment has no mount; that must never look like an error.
    await expect(page.getByText(/skills directory/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'wiki-writer', exact: true })).toBeVisible();
  });

  test('rescan is available and returns the catalogue', async ({ page }) => {
    await login(page);
    await page.goto('/admin/ai/skills');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/skills/rescan') && response.status() === 200,
      ),
      page.getByRole('button', { name: 'Rescan directory' }).click(),
    ]);
    await expect(page.getByRole('link', { name: 'wiki-linker', exact: true })).toBeVisible();
  });

  test('a non-admin cannot reach the Skills surface or its API', async ({ page }) => {
    await registerReader(page, `skills-reader-${Date.now()}@example.com`);

    await page.goto('/admin/ai/skills');
    await expect(page.getByText(/404|does not exist/i).first()).toBeVisible();

    const listing = await page.request.get('/api/ai/skills');
    expect(listing.status()).toBe(403);
    const file = await page.request.get('/api/ai/skills/wiki-linker/files?path=SKILL.md');
    expect(file.status()).toBe(403);
    // A denial must not disclose the skill's content.
    expect(await file.text()).not.toContain('wiki-linker');
  });
});
