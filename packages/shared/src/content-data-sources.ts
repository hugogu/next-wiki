import { z } from 'zod';

/**
 * Registered Content > Data Sources keys. New sources are added here first —
 * the settings service only reads/writes keys registered in this list, so an
 * unregistered key is always rejected rather than silently inserted.
 */
export const WIKI_AI_CONVERSATIONS_SOURCE_KEY = 'wiki-ai-conversations' as const;

export const contentDataSourceKeySchema = z.enum([WIKI_AI_CONVERSATIONS_SOURCE_KEY]);
export type ContentDataSourceKey = z.infer<typeof contentDataSourceKeySchema>;

export const contentDataSourceItemSchema = z.object({
  sourceKey: contentDataSourceKeySchema,
  category: z.literal('content'),
  label: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  updatedAt: z.string(),
});
export type ContentDataSourceItem = z.infer<typeof contentDataSourceItemSchema>;

export const contentDataSourceListResponseSchema = z.object({
  items: z.array(contentDataSourceItemSchema),
});
export type ContentDataSourceListResponse = z.infer<typeof contentDataSourceListResponseSchema>;

export const contentDataSourceUpdateSchema = z.object({
  enabled: z.boolean(),
});
export type ContentDataSourceUpdate = z.infer<typeof contentDataSourceUpdateSchema>;
