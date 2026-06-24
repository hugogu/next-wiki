import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { UpdateUserAppearanceInput } from '@next-wiki/shared';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_FONT_SIZES,
  DEFAULT_FONTS,
  DEFAULT_LIGHT_COLORS,
} from '@/server/appearance/user-tokens';
import {
  getUserAppearance,
  resetUserAppearance,
  updateUserAppearance,
} from '@/server/services/user-appearance';

function validInput(): UpdateUserAppearanceInput {
  return {
    lightColors: { ...DEFAULT_LIGHT_COLORS },
    darkColors: { ...DEFAULT_DARK_COLORS },
    fonts: { ...DEFAULT_FONTS },
    fontSizes: { ...DEFAULT_FONT_SIZES },
  };
}

async function createUser() {
  const { userId } = await authService.register({
    email: `ua-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  return buildUserCtx(userId, 'reader');
}

describe('user-appearance service', () => {
  beforeAll(async () => {
    await db.delete(schema.userAppearance);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns the static defaults with isCustomized=false when the user has no row', async () => {
    const ctx = await createUser();
    const view = await getUserAppearance(ctx);
    expect(view.isCustomized).toBe(false);
    expect(view.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
    expect(view.fonts.body).toBe(DEFAULT_FONTS.body);
    expect(view.fontCatalog.length).toBeGreaterThan(0);
    expect(view.tokenKeys).toContain('primary');
  });

  it('persists values, returns isCustomized=true, and reads them back', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = '#0ea5e9';
    const view = await updateUserAppearance(ctx, input);
    expect(view.isCustomized).toBe(true);
    expect(view.lightColors.primary).toBe('#0ea5e9');

    const again = await getUserAppearance(ctx);
    expect(again.lightColors.primary).toBe('#0ea5e9');
  });

  it('rejects a malformed color in the input', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = 'banana';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects an unknown font key', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.fonts.body = 'comic-sans';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects a missing color token', async () => {
    const ctx = await createUser();
    const input = validInput();
    delete (input.lightColors as Record<string, string>).primary;
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects a non-positive font size', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.fontSizes.base = '0rem';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('requires an authenticated user', async () => {
    await expect(
      updateUserAppearance({ actor: { kind: 'anonymous' } }, validInput()),
    ).rejects.toThrow(DomainError);
  });

  it('resets to defaults (deletes the row)', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = '#abcdef';
    await updateUserAppearance(ctx, input);
    const view = await resetUserAppearance(ctx);
    expect(view.isCustomized).toBe(false);
    expect(view.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
  });

  it('isolates rows between users', async () => {
    const a = await createUser();
    const b = await createUser();
    const input = validInput();
    input.lightColors.primary = '#aaaaaa';
    await updateUserAppearance(a, input);
    const bView = await getUserAppearance(b);
    expect(bView.isCustomized).toBe(false);
    expect(bView.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
  });
});
