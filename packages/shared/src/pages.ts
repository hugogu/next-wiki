import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'Slug must be lowercase letters, numbers, and hyphens, starting with a letter or number',
  });

export const createPageInputSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type CreatePageInput = z.infer<typeof createPageInputSchema>;

export const newDraftInputSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftInput = z.infer<typeof newDraftInputSchema>;

export const slugInputSchema = z.object({
  slug: z.string(),
});

export const revisionInputSchema = z.object({
  slug: z.string(),
  version: z.number().int().min(1),
});
