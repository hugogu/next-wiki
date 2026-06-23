import { z } from 'zod';

/**
 * System appearance (006). Structural validation only — semantic checks (valid
 * CSS color, known font-catalog key, complete token coverage, positive sizes)
 * live in the server service so the bundled catalog/token registry stays
 * server-side. See contracts/appearance-settings.md.
 */

export const appearanceColorsSchema = z.record(z.string(), z.string().min(1));
export type AppearanceColors = z.infer<typeof appearanceColorsSchema>;

export const appearanceFontsSchema = z.object({
  body: z.string().min(1),
  display: z.string().min(1),
  mono: z.string().min(1),
});
export type AppearanceFonts = z.infer<typeof appearanceFontsSchema>;

export const appearanceFontSizesSchema = z.object({
  base: z.string().min(1),
  h1: z.string().min(1),
  h2: z.string().min(1),
  h3: z.string().min(1),
});
export type AppearanceFontSizes = z.infer<typeof appearanceFontSizesSchema>;

export const updateAppearanceSettingsInputSchema = z.object({
  lightColors: appearanceColorsSchema,
  darkColors: appearanceColorsSchema,
  fonts: appearanceFontsSchema,
  fontSizes: appearanceFontSizesSchema,
});
export type UpdateAppearanceSettingsInput = z.infer<typeof updateAppearanceSettingsInputSchema>;

export const fontCatalogEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  stack: z.string(),
});
export type FontCatalogEntry = z.infer<typeof fontCatalogEntrySchema>;

export const appearanceSettingsViewSchema = z.object({
  lightColors: appearanceColorsSchema,
  darkColors: appearanceColorsSchema,
  fonts: appearanceFontsSchema,
  fontSizes: appearanceFontSizesSchema,
  fontCatalog: z.array(fontCatalogEntrySchema),
  tokenKeys: z.array(z.string()),
});
export type AppearanceSettingsView = z.infer<typeof appearanceSettingsViewSchema>;
