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
    relation: z.enum(['explicit_save', 'automatic_capture', 'checkpoint']),
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
