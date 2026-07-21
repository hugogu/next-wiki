import { z } from 'zod';

/**
 * Registered Content > Data Sources keys. New sources are added here first —
 * the settings service only reads/writes keys registered in this list, so an
 * unregistered key is always rejected rather than silently inserted.
 */
export const AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations' as const;
/** @deprecated (025) Legacy key, renamed to `AI_CONVERSATIONS_SOURCE_KEY`. Kept
 * only as a back-compat alias so `isDataSourceEnabled` can read the stored
 * `enabled` state of a pre-025 deployment during its lazy migration. Never
 * exposed through the Admin-facing source list. */
export const WIKI_AI_CONVERSATIONS_SOURCE_KEY = 'wiki-ai-conversations' as const;

// The legacy key is intentionally NOT part of this schema — it is a
// read-only alias resolved internally (by string literal) during the lazy
// migration, never a registered/public key (see isDataSourceEnabled).
export const contentDataSourceKeySchema = z.enum([AI_CONVERSATIONS_SOURCE_KEY]);
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
