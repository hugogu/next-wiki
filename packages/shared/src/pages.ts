import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'Slug must be lowercase letters, numbers, and hyphens, starting with a letter or number',
  });

const pathRegex = /^[a-z0-9]([a-z0-9-/]*[a-z0-9])?$/;

export const pathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(pathRegex, {
    message: 'Path must be lowercase letters, numbers, hyphens and slashes, with no leading/trailing/consecutive slashes',
  })
  .refine((value) => !value.includes('//'), {
    message: 'Path cannot contain consecutive slashes',
  });

export const createPageInputSchema = z.object({
  path: pathSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type CreatePageInput = z.infer<typeof createPageInputSchema>;

export const newDraftInputSchema = z.object({
  path: pathSchema,
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftInput = z.infer<typeof newDraftInputSchema>;

export const newDraftBodySchema = z.object({
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type NewDraftBody = z.infer<typeof newDraftBodySchema>;

export const pagePathInputSchema = z.object({
  path: z.string(),
});

export const revisionInputSchema = z.object({
  path: z.string(),
  version: z.number().int().min(1),
});

export const updatePagePropertiesSchema = z.object({
  path: pathSchema,
});
export type UpdatePagePropertiesInput = z.infer<typeof updatePagePropertiesSchema>;
