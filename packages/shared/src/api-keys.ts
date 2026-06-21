import { z } from 'zod';

export const apiKeyScopeSchema = z.enum([
  'view',
  'create',
  'edit',
  'delete',
  'share',
  'run',
  'storage',
  'preferences',
  'transfers',
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1, 'At least one scope is required')
    .refine((items) => items.length === new Set(items).size, {
      message: 'Scopes must be unique',
    }),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

export const apiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  keyPrefix: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
});
export type ApiKeyView = z.infer<typeof apiKeyViewSchema>;

export const apiKeyCreatedSchema = apiKeyViewSchema.extend({
  keySecret: z.string(),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const apiKeyRevealSchema = z.object({
  id: z.string(),
  keySecret: z.string(),
});
export type ApiKeyReveal = z.infer<typeof apiKeyRevealSchema>;
