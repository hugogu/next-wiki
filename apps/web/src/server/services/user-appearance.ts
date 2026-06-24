import { eq } from 'drizzle-orm';
import type {
  UserAppearanceColors,
  UserAppearanceFonts,
  UserAppearanceFontSizes,
  UserAppearanceView,
  UpdateUserAppearanceInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  COLOR_TOKEN_KEYS,
  DEFAULT_DARK_COLORS,
  DEFAULT_FONT_SIZES,
  DEFAULT_FONTS,
  DEFAULT_LIGHT_COLORS,
  FONT_CATALOG,
  FONT_CATALOG_KEYS,
  FONT_SIZE_KEYS,
  FONT_SLOTS,
} from '@/server/appearance/user-tokens';

const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const HSL = /^hsla?\(\s*\d{1,3}(deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const LENGTH = /^\d*\.?\d+(rem|em|px)$/;

export function isValidCssColor(value: string): boolean {
  const v = value.trim();
  return HEX.test(v) || RGB.test(v) || HSL.test(v);
}

export function isValidFontSize(value: string): boolean {
  const v = value.trim();
  return LENGTH.test(v) && parseFloat(v) > 0;
}

function requireUserId(ctx: PermCtx): string {
  const id = getActorUserId(ctx);
  if (!id) throw new DomainError('UNAUTHORIZED', 'Sign in to manage your reading theme');
  return id;
}

function assertColors(colors: UserAppearanceColors, label: string): void {
  for (const key of COLOR_TOKEN_KEYS) {
    const value = colors[key];
    if (value === undefined) {
      throw new DomainError('BAD_REQUEST', `Missing ${label} color token "${key}"`);
    }
    if (!isValidCssColor(value)) {
      throw new DomainError('BAD_REQUEST', `Invalid ${label} color for "${key}": ${value}`);
    }
  }
}

function assertFonts(fonts: UserAppearanceFonts): void {
  for (const slot of FONT_SLOTS) {
    const key = fonts[slot];
    if (!FONT_CATALOG_KEYS.includes(key)) {
      throw new DomainError('BAD_REQUEST', `Unknown font for "${slot}": ${key}`);
    }
  }
}

function assertFontSizes(sizes: UserAppearanceFontSizes): void {
  for (const key of FONT_SIZE_KEYS) {
    const value = sizes[key];
    if (!isValidFontSize(value)) {
      throw new DomainError('BAD_REQUEST', `Invalid font size for "${key}": ${value}`);
    }
  }
}

export function validateUserAppearanceInput(input: UpdateUserAppearanceInput): void {
  assertColors(input.lightColors, 'light');
  assertColors(input.darkColors, 'dark');
  assertFonts(input.fonts);
  assertFontSizes(input.fontSizes);
}

function toView(
  values: {
    lightColors: UserAppearanceColors;
    darkColors: UserAppearanceColors;
    fonts: UserAppearanceFonts;
    fontSizes: UserAppearanceFontSizes;
  },
  isCustomized: boolean,
): UserAppearanceView {
  return {
    lightColors: values.lightColors,
    darkColors: values.darkColors,
    fonts: values.fonts,
    fontSizes: values.fontSizes,
    fontCatalog: FONT_CATALOG,
    tokenKeys: [...COLOR_TOKEN_KEYS],
    isCustomized,
  };
}

/** Read the user's per-row tokens. Falls back to the static defaults when no row. */
export async function getUserAppearance(ctx: PermCtx): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  const row = await db.query.userAppearance.findFirst({
    where: eq(schema.userAppearance.userId, userId),
  });
  if (!row)
    return toView(
      {
        lightColors: DEFAULT_LIGHT_COLORS,
        darkColors: DEFAULT_DARK_COLORS,
        fonts: DEFAULT_FONTS,
        fontSizes: DEFAULT_FONT_SIZES,
      },
      false,
    );
  return toView(
    {
      lightColors: row.lightColors as UserAppearanceColors,
      darkColors: row.darkColors as UserAppearanceColors,
      fonts: row.fonts as UserAppearanceFonts,
      fontSizes: row.fontSizes as UserAppearanceFontSizes,
    },
    true,
  );
}

/** Upsert the user's per-row tokens. Validates input. */
export async function updateUserAppearance(
  ctx: PermCtx,
  input: UpdateUserAppearanceInput,
): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  validateUserAppearanceInput(input);

  await db
    .insert(schema.userAppearance)
    .values({
      userId,
      lightColors: input.lightColors,
      darkColors: input.darkColors,
      fonts: input.fonts,
      fontSizes: input.fontSizes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.userAppearance.userId,
      set: {
        lightColors: input.lightColors,
        darkColors: input.darkColors,
        fonts: input.fonts,
        fontSizes: input.fontSizes,
        updatedAt: new Date(),
      },
    });

  return toView(
    {
      lightColors: input.lightColors,
      darkColors: input.darkColors,
      fonts: input.fonts,
      fontSizes: input.fontSizes,
    },
    true,
  );
}

/** Delete the user's per-row tokens; falls back to the static defaults. */
export async function resetUserAppearance(ctx: PermCtx): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  await db.delete(schema.userAppearance).where(eq(schema.userAppearance.userId, userId));
  return toView(
    {
      lightColors: DEFAULT_LIGHT_COLORS,
      darkColors: DEFAULT_DARK_COLORS,
      fonts: DEFAULT_FONTS,
      fontSizes: DEFAULT_FONT_SIZES,
    },
    false,
  );
}
