import { eq } from 'drizzle-orm';
import type {
  AppearanceColors,
  AppearanceFonts,
  AppearanceFontSizes,
  AppearanceSettingsView,
  UpdateAppearanceSettingsInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
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
} from '@/server/appearance/tokens';

const SETTINGS_ID = 'default';

export function assertCanManageAppearance(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage appearance');
  }
}

// ---- Pure validation (no DB) ----------------------------------------------

const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const HSL = /^hsla?\(\s*\d{1,3}(deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;

export function isValidCssColor(value: string): boolean {
  const v = value.trim();
  return HEX.test(v) || RGB.test(v) || HSL.test(v);
}

const LENGTH = /^\d*\.?\d+(rem|em|px)$/;

export function isValidFontSize(value: string): boolean {
  const v = value.trim();
  return LENGTH.test(v) && parseFloat(v) > 0;
}

function assertColors(colors: AppearanceColors, label: string): void {
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

function assertFonts(fonts: AppearanceFonts): void {
  for (const slot of FONT_SLOTS) {
    const key = fonts[slot];
    if (!FONT_CATALOG_KEYS.includes(key)) {
      throw new DomainError('BAD_REQUEST', `Unknown font for "${slot}": ${key}`);
    }
  }
}

function assertFontSizes(sizes: AppearanceFontSizes): void {
  for (const key of FONT_SIZE_KEYS) {
    const value = sizes[key];
    if (!isValidFontSize(value)) {
      throw new DomainError('BAD_REQUEST', `Invalid font size for "${key}": ${value}`);
    }
  }
}

/** Validate an already-parsed input. Throws DomainError('BAD_REQUEST') on the first problem. */
export function validateAppearanceInput(input: UpdateAppearanceSettingsInput): void {
  assertColors(input.lightColors, 'light');
  assertColors(input.darkColors, 'dark');
  assertFonts(input.fonts);
  assertFontSizes(input.fontSizes);
}

// ---- Read / write ----------------------------------------------------------

interface AppearanceValues {
  lightColors: AppearanceColors;
  darkColors: AppearanceColors;
  fonts: AppearanceFonts;
  fontSizes: AppearanceFontSizes;
}

const DEFAULTS: AppearanceValues = {
  lightColors: DEFAULT_LIGHT_COLORS,
  darkColors: DEFAULT_DARK_COLORS,
  fonts: DEFAULT_FONTS,
  fontSizes: DEFAULT_FONT_SIZES,
};

/** Read the active appearance values, falling back to the static defaults. */
export async function getAppearanceSettings(): Promise<AppearanceValues> {
  const row = await db.query.appearanceSettings.findFirst({
    where: eq(schema.appearanceSettings.id, SETTINGS_ID),
  });
  if (!row) return DEFAULTS;
  return {
    lightColors: row.lightColors as AppearanceColors,
    darkColors: row.darkColors as AppearanceColors,
    fonts: row.fonts as AppearanceFonts,
    fontSizes: row.fontSizes as AppearanceFontSizes,
  };
}

function toView(values: AppearanceValues): AppearanceSettingsView {
  return {
    ...values,
    fontCatalog: FONT_CATALOG,
    tokenKeys: [...COLOR_TOKEN_KEYS],
  };
}

/** Public-readable view (no secrets — values are already in every page's CSS). */
export async function getAppearanceView(): Promise<AppearanceSettingsView> {
  return toView(await getAppearanceSettings());
}

/** Replace the appearance settings. Requires `manage_appearance`. */
export async function updateAppearanceSettings(
  ctx: PermCtx,
  input: UpdateAppearanceSettingsInput,
): Promise<AppearanceSettingsView> {
  assertCanManageAppearance(ctx);
  validateAppearanceInput(input);

  const updatedBy = getActorUserId(ctx);
  const values = {
    lightColors: input.lightColors,
    darkColors: input.darkColors,
    fonts: input.fonts,
    fontSizes: input.fontSizes,
    updatedBy,
    updatedAt: new Date(),
  };

  await db
    .insert(schema.appearanceSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.appearanceSettings.id, set: values });

  return toView({
    lightColors: input.lightColors,
    darkColors: input.darkColors,
    fonts: input.fonts,
    fontSizes: input.fontSizes,
  });
}
