import { z } from 'zod';

/**
 * Per-user reading-theme tokens (006). One row per user. Structural validation
 * only — semantic checks (valid CSS color, known font-catalog key, complete
 * token coverage, positive sizes) live in the server service so the bundled
 * catalog/token registry stays server-side. See
 * `apps/web/src/server/services/user-appearance.ts`.
 */

export const userAppearanceColorsSchema = z.record(z.string(), z.string().min(1));
export type UserAppearanceColors = z.infer<typeof userAppearanceColorsSchema>;

export const userAppearanceFontsSchema = z.object({
  body: z.string().min(1),
  display: z.string().min(1),
  mono: z.string().min(1),
});
export type UserAppearanceFonts = z.infer<typeof userAppearanceFontsSchema>;

export const userAppearanceFontSizesSchema = z.object({
  base: z.string().min(1),
  h1: z.string().min(1),
  h2: z.string().min(1),
  h3: z.string().min(1),
});
export type UserAppearanceFontSizes = z.infer<typeof userAppearanceFontSizesSchema>;

export const updateUserAppearanceInputSchema = z.object({
  lightColors: userAppearanceColorsSchema,
  darkColors: userAppearanceColorsSchema,
  fonts: userAppearanceFontsSchema,
  fontSizes: userAppearanceFontSizesSchema,
});
export type UpdateUserAppearanceInput = z.infer<typeof updateUserAppearanceInputSchema>;

export const fontCatalogEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  stack: z.string(),
});
export type FontCatalogEntry = z.infer<typeof fontCatalogEntrySchema>;

export const userAppearanceViewSchema = z.object({
  lightColors: userAppearanceColorsSchema,
  darkColors: userAppearanceColorsSchema,
  fonts: userAppearanceFontsSchema,
  fontSizes: userAppearanceFontSizesSchema,
  fontCatalog: z.array(fontCatalogEntrySchema),
  tokenKeys: z.array(z.string()),
  isCustomized: z.boolean(),
});
export type UserAppearanceView = z.infer<typeof userAppearanceViewSchema>;
