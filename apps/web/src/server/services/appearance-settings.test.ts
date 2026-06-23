import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { UpdateAppearanceSettingsInput } from '@next-wiki/shared';
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
} from '@/server/appearance/tokens';
import {
  getAppearanceSettings,
  isValidCssColor,
  isValidFontSize,
  updateAppearanceSettings,
  validateAppearanceInput,
} from '@/server/services/appearance-settings';

function validInput(): UpdateAppearanceSettingsInput {
  return {
    lightColors: { ...DEFAULT_LIGHT_COLORS },
    darkColors: { ...DEFAULT_DARK_COLORS },
    fonts: { ...DEFAULT_FONTS },
    fontSizes: { ...DEFAULT_FONT_SIZES },
  };
}

async function createAdmin() {
  const { userId } = await authService.register({ email: `admin-${Date.now()}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('appearance-settings pure validation', () => {
  it('accepts hex, rgb(a) and hsl(a) colors', () => {
    expect(isValidCssColor('#fff')).toBe(true);
    expect(isValidCssColor('#b45309')).toBe(true);
    expect(isValidCssColor('rgba(180, 83, 9, 0.25)')).toBe(true);
    expect(isValidCssColor('hsl(30, 90%, 40%)')).toBe(true);
  });

  it('rejects malformed colors', () => {
    expect(isValidCssColor('not-a-color')).toBe(false);
    expect(isValidCssColor('#xyz')).toBe(false);
    expect(isValidCssColor('rgb(300)')).toBe(false);
  });

  it('accepts positive lengths and rejects others', () => {
    expect(isValidFontSize('1rem')).toBe(true);
    expect(isValidFontSize('14px')).toBe(true);
    expect(isValidFontSize('0rem')).toBe(false);
    expect(isValidFontSize('-1rem')).toBe(false);
    expect(isValidFontSize('big')).toBe(false);
  });

  it('rejects a malformed color in the input', () => {
    const input = validInput();
    input.lightColors.primary = 'banana';
    expect(() => validateAppearanceInput(input)).toThrow(DomainError);
  });

  it('rejects an unknown font key', () => {
    const input = validInput();
    input.fonts.body = 'comic-sans';
    expect(() => validateAppearanceInput(input)).toThrow(DomainError);
  });

  it('rejects a missing color token', () => {
    const input = validInput();
    delete (input.lightColors as Record<string, string>).primary;
    expect(() => validateAppearanceInput(input)).toThrow(DomainError);
  });

  it('rejects a non-positive font size', () => {
    const input = validInput();
    input.fontSizes.base = '0rem';
    expect(() => validateAppearanceInput(input)).toThrow(DomainError);
  });
});

describe('appearance-settings persistence', () => {
  beforeAll(async () => {
    await db.delete(schema.appearanceSettings);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns static defaults when unset', async () => {
    const values = await getAppearanceSettings();
    expect(values.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
    expect(values.fonts.body).toBe(DEFAULT_FONTS.body);
  });

  it('persists a configured value for an admin and reads it back', async () => {
    const ctx = await createAdmin();
    const input = validInput();
    input.lightColors.primary = '#123456';
    const view = await updateAppearanceSettings(ctx, input);
    expect(view.lightColors.primary).toBe('#123456');
    expect(view.fontCatalog.length).toBeGreaterThan(0);

    const persisted = await getAppearanceSettings();
    expect(persisted.lightColors.primary).toBe('#123456');
  });

  it('rejects writes from a non-admin', async () => {
    const { userId } = await authService.register({ email: `reader-${Date.now()}@example.com`, password: 'Password123!' });
    const ctx = buildUserCtx(userId, 'reader');
    await expect(updateAppearanceSettings(ctx, validInput())).rejects.toThrow(DomainError);
  });
});
