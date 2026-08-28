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
export const agentMemoryRecordStateSchema = z.enum(['active', 'forgotten', 'archived']);
export const agentMemoryCaptureStatusSchema = z.enum(['queued', 'running', 'durable', 'failed', 'cancelled']);

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
  evidence: z.array(z.object({
    evidenceId: z.string().uuid(),
    relation: z.enum(['explicit_save', 'automatic_capture', 'checkpoint', 'promotion']),
    citation: agentMemoryCitationSchema,
  })).default([]),
});

export const agentMemoryRecallInputSchema = z.object({
  query: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxRecallQueryCharacters),
  limit: z.number().int().min(1).max(AGENT_MEMORY_LIMITS.maxRecallResults).optional(),
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

export const agentMemoryRecordLifecycleInputSchema = z.object({
  state: z.enum(['active', 'forgotten', 'archived']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const agentMemoryPromotionInputSchema = z.object({
  sourceMemoryId: z.string().uuid(),
  destinationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxSaveCharacters),
});

export const agentMemoryRetentionInputSchema = z.object({
  retentionDays: z.number().int().min(1).max(3_650),
});

export const agentMemoryEvidenceInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  sessionDigest: z.string().regex(/^[a-f0-9]{32,128}$/),
  checkpoint: z.boolean(),
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
export type AgentMemoryRecordLifecycleInput = z.infer<typeof agentMemoryRecordLifecycleInputSchema>;
export type AgentMemoryPromotionInput = z.infer<typeof agentMemoryPromotionInputSchema>;
export type AgentMemoryRetentionInput = z.infer<typeof agentMemoryRetentionInputSchema>;

/** Generic connection and sharing vocabulary used by v2 adapters. */
export const agentMemoryConnectionStateSchema = z.enum(['active', 'disabled', 'revoked']);
export const agentMemoryDestinationRoleSchema = z.enum(['private', 'shared']);
export const agentMemoryGrantCapabilitySchema = z.enum(['read', 'write']);
export const agentMemoryGrantStateSchema = z.enum(['active', 'revoked', 'expired']);
export const agentMemoryRecordRoleSchema = z.enum(['evidence', 'synthesis', 'curated']);
export const agentMemoryRecordOriginSchema = z.enum(['explicit_save', 'automatic_capture', 'checkpoint', 'import', 'promotion']);
export const agentMemoryRecallScopeSchema = z.enum(['own', 'granted', 'own_and_granted']);

export const agentMemoryV2ConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  agentIdentity: z.string().min(1).max(100),
  displayLabel: z.string().min(1).max(160),
  state: agentMemoryConnectionStateSchema,
  capabilities: z.object({
    recall: z.boolean(),
    save: z.boolean(),
    forget: z.boolean(),
    capture: z.boolean(),
  }),
  limits: z.object({
    maxRecallResults: z.number().int(),
    maxSaveCharacters: z.number().int(),
    maxEvidenceCharacters: z.number().int(),
  }),
});

export const agentMemoryV2RecallInputSchema = z.object({
  query: z.string().trim().min(1).max(AGENT_MEMORY_LIMITS.maxRecallQueryCharacters),
  scope: agentMemoryRecallScopeSchema.default('granted'),
  limit: z.number().int().min(1).max(AGENT_MEMORY_LIMITS.maxRecallResults).optional(),
});

export const agentMemoryV2SaveInputSchema = agentMemorySaveInputSchema.extend({
  role: agentMemoryRecordRoleSchema.default('synthesis'),
  origin: agentMemoryRecordOriginSchema.default('explicit_save'),
});

export const agentMemoryV2CaptureInputSchema = agentMemoryEvidenceInputSchema.extend({
  origin: z.enum(['automatic_capture', 'checkpoint']).default('automatic_capture'),
});

export const agentMemoryV2RecordSchema = agentMemoryRecordSchema.extend({
  role: agentMemoryRecordRoleSchema,
  origin: agentMemoryRecordOriginSchema,
  destinationRole: agentMemoryDestinationRoleSchema,
  authorConnectionId: z.string().uuid(),
});

export const agentMemoryV2RecallResponseSchema = z.object({
  results: z.array(agentMemoryV2RecordSchema),
  retrieval: z.object({ mode: z.literal('lexical'), complete: z.boolean(), returned: z.number().int() }),
});

export type AgentMemoryV2RecallInput = z.infer<typeof agentMemoryV2RecallInputSchema>;
export type AgentMemoryV2SaveInput = z.infer<typeof agentMemoryV2SaveInputSchema>;
export type AgentMemoryV2CaptureInput = z.infer<typeof agentMemoryV2CaptureInputSchema>;
export type AgentMemoryV2Record = z.infer<typeof agentMemoryV2RecordSchema>;
