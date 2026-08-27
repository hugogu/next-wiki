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
  'manage_tags',
  'ai.read',
  'ai.image',
  'attachments',
  'memory.read',
  'memory.write',
  'memory.delete',
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

/**
 * Canonical scope list, in display order. Single source of truth for any UI
 * that enumerates scopes (creation form, scope badges) — deriving from the
 * schema means a newly added scope can never be silently excluded from one
 * screen while present on another.
 */
export const API_KEY_SCOPES: readonly ApiKeyScope[] = apiKeyScopeSchema.options;

// 046: content-space access is an independent dimension from `scopes`
// (action capabilities) — which spaces (wiki/raw/generated) a key may read.
// 'wiki' is always implicitly allowed; 'raw'/'generated' require the owner
// to be an admin, both at grant time and on every request.
export const spaceKindSchema = z.enum(['wiki', 'raw', 'generated']);
export type SpaceKind = z.infer<typeof spaceKindSchema>;

export const API_KEY_SPACE_KINDS: readonly SpaceKind[] = spaceKindSchema.options;

export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1, 'At least one scope is required')
    .refine((items) => items.length === new Set(items).size, {
      message: 'Scopes must be unique',
    }),
  spaceAccess: z
    .array(spaceKindSchema)
    .refine((items) => items.length === new Set(items).size, {
      message: 'Space access entries must be unique',
    })
    .optional(),
  hermesMemory: z
    .object({
      displayName: z.string().min(1).max(100).optional(),
      sharedNamespaceId: z.string().uuid().optional(),
    })
    .optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

export const apiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  spaceAccess: z.array(spaceKindSchema),
  keyPrefix: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  hermesMemoryDestination: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
      state: z.enum(['active', 'disabled']),
    })
    .nullable()
    .optional(),
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
