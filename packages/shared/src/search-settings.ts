import { z } from 'zod';

export const DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS = 400;
export const MIN_IMMEDIATE_SEARCH_TIMEOUT_MS = 100;
export const MAX_IMMEDIATE_SEARCH_TIMEOUT_MS = 2_000;

export const searchSettingsViewSchema = z.object({
  fullTextSearchEnabled: z.boolean(),
  fuzzySearchEnabled: z.boolean(),
  semanticSearchEnabled: z.boolean(),
  immediateSearchTimeoutMs: z.number().int().min(MIN_IMMEDIATE_SEARCH_TIMEOUT_MS).max(MAX_IMMEDIATE_SEARCH_TIMEOUT_MS),
  minRelevanceScore: z.number().min(-1).max(1),
  showExcerpts: z.boolean(),
  excerptLength: z.number().int().min(20).max(500),
  updatedAt: z.string().nullable(),
});
export type SearchSettingsView = z.infer<typeof searchSettingsViewSchema>;

export const updateSearchSettingsInputSchema = z
  .object({
    fullTextSearchEnabled: z.boolean().optional(),
    fuzzySearchEnabled: z.boolean().optional(),
    semanticSearchEnabled: z.boolean().optional(),
    immediateSearchTimeoutMs: z.coerce.number().int().min(MIN_IMMEDIATE_SEARCH_TIMEOUT_MS).max(MAX_IMMEDIATE_SEARCH_TIMEOUT_MS).optional(),
    minRelevanceScore: z.coerce.number().min(-1).max(1).optional(),
    showExcerpts: z.boolean().optional(),
    excerptLength: z.coerce.number().int().min(20).max(500).optional(),
  })
  // At least one lexical capability must stay reachable; a partial update that
  // disables only one of them is validated against the stored row by the service.
  .refine((value) => value.fullTextSearchEnabled !== false || value.fuzzySearchEnabled !== false, {
    message: 'At least one of full-text or fuzzy search must remain enabled',
    path: ['fullTextSearchEnabled'],
  });
export type UpdateSearchSettingsInput = z.infer<typeof updateSearchSettingsInputSchema>;
