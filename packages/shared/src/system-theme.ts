import { z } from 'zod';

/**
 * Site-wide system theme CSS (006). Admin authors free-form CSS that is
 * sanitized on save by `sanitizeSystemThemeCss`. Applied to the app shell
 * (outside .prose). See `apps/web/src/server/services/system-theme.ts`.
 */

export const systemThemeViewSchema = z.object({
  css: z.string(),
  updatedAt: z.string().nullable(),
});
export type SystemThemeView = z.infer<typeof systemThemeViewSchema>;

export const updateSystemThemeInputSchema = z.object({
  css: z.string().max(50_000),
});
export type UpdateSystemThemeInput = z.infer<typeof updateSystemThemeInputSchema>;
