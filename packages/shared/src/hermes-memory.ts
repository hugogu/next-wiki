import { z } from 'zod';

export const HERMES_MEMORY_LIMITS = {
  maxRecallResults: 10,
  maxRecallQueryCharacters: 4_000,
  maxSaveCharacters: 16_000,
  maxEvidenceCharacters: 64_000,
  maxEvidenceMessages: 100,
} as const;

export const hermesMemoryNamespaceStateSchema = z.enum(['active', 'disabled']);
export const hermesMemoryRecordTypeSchema = z.enum(['memory', 'evidence']);
export const hermesMemoryRecordStateSchema = z.enum(['active', 'forgotten']);
export const hermesMemoryCaptureStatusSchema = z.enum(['queued', 'running', 'durable', 'failed', 'cancelled']);

export const hermesMemoryCitationSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revisionHash: z.string(),
  title: z.string(),
  canonicalUrl: z.string().url(),
  createdAt: z.string().datetime(),
});

export const hermesMemoryRecordSchema = z.object({
  memoryId: z.string().uuid(),
  type: hermesMemoryRecordTypeSchema,
  state: hermesMemoryRecordStateSchema,
  title: z.string(),
  excerpt: z.string(),
  citation: hermesMemoryCitationSchema,
  evidence: z.array(z.object({
    evidenceId: z.string().uuid(),
    relation: z.enum(['explicit_save', 'automatic_capture', 'checkpoint']),
    citation: hermesMemoryCitationSchema,
  })).default([]),
});

export const hermesMemoryRecallInputSchema = z.object({
  query: z.string().trim().min(1).max(HERMES_MEMORY_LIMITS.maxRecallQueryCharacters),
  limit: z.number().int().min(1).max(HERMES_MEMORY_LIMITS.maxRecallResults).optional(),
});

export const hermesMemorySaveInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  content: z.string().trim().min(1).max(HERMES_MEMORY_LIMITS.maxSaveCharacters),
  title: z.string().trim().min(1).max(160).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
  evidenceIds: z.array(z.string().uuid()).max(20).optional(),
});

export const hermesMemoryForgetInputSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const hermesMemoryEvidenceInputSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  sessionDigest: z.string().regex(/^[a-f0-9]{32,128}$/),
  checkpoint: z.boolean(),
  messages: z
    .array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().trim().min(1).max(HERMES_MEMORY_LIMITS.maxEvidenceCharacters),
    }))
    .min(1)
    .max(HERMES_MEMORY_LIMITS.maxEvidenceMessages)
    .superRefine((messages, ctx) => {
      const length = messages.reduce((total, message) => total + message.content.length, 0);
      if (length > HERMES_MEMORY_LIMITS.maxEvidenceCharacters) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence content is too large' });
      }
    }),
});

export type HermesMemoryRecallInput = z.infer<typeof hermesMemoryRecallInputSchema>;
export type HermesMemorySaveInput = z.infer<typeof hermesMemorySaveInputSchema>;
export type HermesMemoryEvidenceInput = z.infer<typeof hermesMemoryEvidenceInputSchema>;
export type HermesMemoryRecord = z.infer<typeof hermesMemoryRecordSchema>;
