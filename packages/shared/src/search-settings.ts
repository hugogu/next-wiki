import { z } from 'zod';

export const searchSettingsViewSchema = z.object({
  semanticSearchEnabled: z.boolean(),
  minRelevanceScore: z.number().min(-1).max(1),
  showExcerpts: z.boolean(),
  excerptLength: z.number().int().min(20).max(500),
  updatedAt: z.string().nullable(),
});
export type SearchSettingsView = z.infer<typeof searchSettingsViewSchema>;

export const updateSearchSettingsInputSchema = z.object({
  semanticSearchEnabled: z.boolean().optional(),
  minRelevanceScore: z.coerce.number().min(-1).max(1).optional(),
  showExcerpts: z.boolean().optional(),
  excerptLength: z.coerce.number().int().min(20).max(500).optional(),
});
export type UpdateSearchSettingsInput = z.infer<typeof updateSearchSettingsInputSchema>;
