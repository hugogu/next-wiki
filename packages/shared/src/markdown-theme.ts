import { z } from 'zod';

/**
 * Per-user Markdown reading themes (006). See contracts/markdown-themes.md.
 */

export const markdownThemeSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isBuiltin: z.boolean(),
  owned: z.boolean(),
});
export type MarkdownThemeSummary = z.infer<typeof markdownThemeSummarySchema>;

export const markdownThemeListViewSchema = z.object({
  activeThemeId: z.string().uuid().nullable(),
  themes: z.array(markdownThemeSummarySchema),
});
export type MarkdownThemeListView = z.infer<typeof markdownThemeListViewSchema>;

export const markdownThemeViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  css: z.string(),
  isBuiltin: z.boolean(),
  owned: z.boolean(),
});
export type MarkdownThemeView = z.infer<typeof markdownThemeViewSchema>;

export const createMarkdownThemeInputSchema = z.object({
  sourceThemeId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});
export type CreateMarkdownThemeInput = z.infer<typeof createMarkdownThemeInputSchema>;

export const updateMarkdownThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  css: z.string().max(20_000).optional(),
});
export type UpdateMarkdownThemeInput = z.infer<typeof updateMarkdownThemeInputSchema>;

export const activateMarkdownThemeInputSchema = z.object({
  themeId: z.string().uuid().nullable(),
});
export type ActivateMarkdownThemeInput = z.infer<typeof activateMarkdownThemeInputSchema>;
