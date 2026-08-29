import { z } from 'zod';

export const AGENT_MEMORY_LIMITS = {
  maxRecallResults: 10,
  maxRecallQueryCharacters: 4_000,
  maxSaveCharacters: 16_000,
  maxEvidenceCharacters: 64_000,
  maxEvidenceMessages: 100,
} as const;

export const agentMemoryNamespaceStateSchema = z.enum(['active', 'disabled']);
export const agentMemoryRecordTypeSchema = z.enum(['memory', 'evidence']);
export const agentMemoryRecordStateSchema = z.enum(['active', 'forgotten']);
export const agentMemoryCaptureStatusSchema = z.enum(['queued', 'running', 'durable', 'failed', 'cancelled']);

// 040: product-neutral connection identity, shared-destination role, and
// closed provenance/capture vocabularies. Additive to the 039 contract above.
export const AGENT_MEMORY_BOUNDS = {
  outboxMaxEntriesPerConnection: 500,
  outboxMaxEntryBytes: 256 * 1024,
  outboxEntryTtlDays: 7,
  localDeliveryBudgetMs: 200,
  outboxRetryBackoffMinMs: 5_000,
  outboxRetryBackoffMaxMs: 10 * 60 * 1000,
  captureEnvelopeMaxBytes: 1024 * 1024,
  captureEnvelopeTtlHours: 24,
} as const;

export const agentMemoryConnectionStateSchema = z.enum(['active', 'disabled', 'revoked']);
export const agentMemoryDestinationRoleSchema = z.enum(['private', 'shared']);
export const agentMemoryGrantCapabilitySchema = z.enum(['read']);
export const agentMemoryGrantStateSchema = z.enum(['active', 'revoked', 'expired']);
export const agentMemoryOriginSchema = z.enum(['explicit_save', 'automatic_capture', 'checkpoint', 'import', 'promotion']);
export const agentMemoryContentKindSchema = z.enum(['original', 'generated']);
export const agentMemoryCaptureKindSchema = z.enum(['turn', 'checkpoint', 'compaction', 'session_end']);
export const agentMemoryRecallScopeSchema = z.enum(['own', 'granted', 'own_and_granted']);

export const agentMemoryConnectionSummarySchema = z.object({
  connectionId: z.string().uuid(),
  displayName: z.string(),
  agentIdentity: z.string(),
  state: agentMemoryConnectionStateSchema,
  createdAt: z.string().datetime(),
  disabledAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});

export const agentMemoryCreateConnectionInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  agentIdentity: z.string().trim().min(1).max(100).optional(),
});

export const agentMemoryDestinationGrantSchema = z.object({
  grantId: z.string().uuid(),
  granteeConnectionId: z.string().uuid(),
  destinationId: z.string().uuid(),
  capability: agentMemoryGrantCapabilitySchema,
  state: agentMemoryGrantStateSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});

export const agentMemoryCreateGrantInputSchema = z.object({
  granteeConnectionId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

export const agentMemoryPromotionInputSchema = z.object({
  sourceRecordId: z.string().uuid(),
  destinationId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
});

export const agentMemoryCreateSharedDestinationInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
});

export const agentMemorySharedDestinationSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  role: z.literal('shared'),
  state: agentMemoryNamespaceStateSchema,
});

export const agentMemoryCitationSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revisionHash: z.string(),
  title: z.string(),
  canonicalUrl: z.string().url(),
  createdAt: z.string().datetime(),
});

export const agentMemoryRecordSchema = z.object({
  memoryId: z.string().uuid(),
  type: agentMemoryRecordTypeSchema,
  state: agentMemoryRecordStateSchema,
  title: z.string(),
  excerpt: z.string(),
  citation: agentMemoryCitationSchema,
  origin: agentMemoryOriginSchema.optional(),
  contentKind: agentMemoryContentKindSchema.optional(),
  evidence: z.array(z.object({
    evidenceId: z.string().uuid(),
    relation: z.enum(['explicit_save', 'automatic_capture', 'checkpoint', 'promotion', 'import']),
    citation: agentMemoryCitationSchema,
  })).default([]),
});

export const agentMemoryRecallInputSchema = z.object({
  query: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxRecallQueryCharacters),
  limit: z.number().int().min(1).max(AGENT_MEMORY_LIMITS.maxRecallResults).optional(),
  scope: agentMemoryRecallScopeSchema.optional(),
});

export const agentMemorySaveInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  content: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxSaveCharacters),
  title: z.string().trim().min(1).max(160).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
  evidenceIds: z.array(z.string().uuid()).max(20).optional(),
});

export const agentMemoryForgetInputSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const agentMemoryEvidenceInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  sessionDigest: z.string().regex(/^[a-f0-9]{32,128}$/),
  checkpoint: z.boolean(),
  captureKind: agentMemoryCaptureKindSchema.optional(),
  messages: z
    .array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxEvidenceCharacters),
    }))
    .min(1)
    .max(AGENT_MEMORY_LIMITS.maxEvidenceMessages)
    .superRefine((messages, ctx) => {
      const length = messages.reduce((total, message) => total + message.content.length, 0);
      if (length > AGENT_MEMORY_LIMITS.maxEvidenceCharacters) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence content is too large' });
      }
    }),
});

export type AgentMemoryRecallInput = z.infer<typeof agentMemoryRecallInputSchema>;
export type AgentMemorySaveInput = z.infer<typeof agentMemorySaveInputSchema>;
export type AgentMemoryEvidenceInput = z.infer<typeof agentMemoryEvidenceInputSchema>;
export type AgentMemoryRecord = z.infer<typeof agentMemoryRecordSchema>;
export type AgentMemoryConnectionSummary = z.infer<typeof agentMemoryConnectionSummarySchema>;
export type AgentMemoryCreateConnectionInput = z.infer<typeof agentMemoryCreateConnectionInputSchema>;
export type AgentMemoryDestinationGrant = z.infer<typeof agentMemoryDestinationGrantSchema>;
export type AgentMemoryCreateGrantInput = z.infer<typeof agentMemoryCreateGrantInputSchema>;
export type AgentMemoryPromotionInput = z.infer<typeof agentMemoryPromotionInputSchema>;
export type AgentMemoryCreateSharedDestinationInput = z.infer<typeof agentMemoryCreateSharedDestinationInputSchema>;
export type AgentMemorySharedDestination = z.infer<typeof agentMemorySharedDestinationSchema>;
export type AgentMemoryRecallScope = z.infer<typeof agentMemoryRecallScopeSchema>;
export type AgentMemoryCaptureKind = z.infer<typeof agentMemoryCaptureKindSchema>;
export type AgentMemoryOrigin = z.infer<typeof agentMemoryOriginSchema>;
export type AgentMemoryContentKind = z.infer<typeof agentMemoryContentKindSchema>;
