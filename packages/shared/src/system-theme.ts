import { z } from 'zod';

/**
 * Site-wide system themes (006). A shared, admin-managed list of named CSS
 * sheets. Built-ins are read-only; admins copy a built-in into a custom row
 * to edit and activate. The layout reads the active theme's CSS from
 * `system_theme_settings.active_theme_id`.
 *
 * Sanitization (postcss allowlist, no color declarations) happens on save in
 * the server service.
 */

export const systemThemeSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isBuiltin: z.boolean(),
});
export type SystemThemeSummary = z.infer<typeof systemThemeSummarySchema>;

export const systemThemeListViewSchema = z.object({
  activeThemeId: z.string().uuid().nullable(),
  themes: z.array(systemThemeSummarySchema),
});
export type SystemThemeListView = z.infer<typeof systemThemeListViewSchema>;

export const systemThemeViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  css: z.string(),
  isBuiltin: z.boolean(),
});
export type SystemThemeView = z.infer<typeof systemThemeViewSchema>;

export const createSystemThemeInputSchema = z.object({
  sourceThemeId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});
export type CreateSystemThemeInput = z.infer<typeof createSystemThemeInputSchema>;

export const updateSystemThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  css: z.string().max(50_000).optional(),
});
export type UpdateSystemThemeInput = z.infer<typeof updateSystemThemeInputSchema>;

export const activateSystemThemeInputSchema = z.object({
  themeId: z.string().uuid().nullable(),
});
export type ActivateSystemThemeInput = z.infer<typeof activateSystemThemeInputSchema>;
