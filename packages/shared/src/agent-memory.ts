import { z } from 'zod';

export const AGENT_MEMORY_LIMITS = {
  maxRecallResults: 10,
  maxRecallQueryCharacters: 4_000,
  maxSaveCharacters: 16_000,
  maxEvidenceCharacters: 64_000,
  maxEvidenceMessages: 100,
} as const;

export const agentMemoryNamespaceStateSchema = z.enum(['active', 'disabled']);
export const agentMemoryRecordTypeSchema = z.enum(['memory', 'evidence', 'source_document']);
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

/**
 * A Memory Wiki source path is deliberately less restrictive than a public
 * next-wiki address: OpenClaw's root files and directory names retain their
 * original case. Traversal and empty segments are rejected at the API boundary.
 */
export const memoryWikiSourcePathSchema = z.string().trim().min(1).max(400)
  .regex(/^(?!\/)(?!.*[\\\\])(?!.*(?:^|\/)\.\.?\/?)(?!.*\/\/)[^\u0000-\u001f\u007f]+\.md$/u, 'Source path must be a relative Markdown path')
  .refine((value) => value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'), 'Source path contains an invalid segment');

export const agentMemorySourceDocumentInputSchema = z.object({
  sourcePath: memoryWikiSourcePathSchema,
  content: z.string().min(1).max(512_000),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceVersion: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict();

export const agentMemorySourceDocumentCitationSchema = agentMemoryCitationSchema.extend({
  sourcePath: memoryWikiSourcePathSchema,
  storagePath: z.string(),
});

export const agentMemorySourceDocumentSchema = z.object({
  memoryRecordId: z.string().uuid(),
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  sourcePath: memoryWikiSourcePathSchema,
  storagePath: z.string(),
  title: z.string(),
  revisionHash: z.string(),
  outcome: z.enum(['created', 'updated', 'unchanged']),
  citation: agentMemorySourceDocumentCitationSchema,
});

export const agentMemoryWikiCoverageSchema = z.object({
  wiki: z.boolean(),
  raw: z.boolean(),
  generated: z.boolean(),
  complete: z.boolean(),
});

export const agentMemoryWikiSearchInputSchema = z.object({
  q: z.string().trim().min(1).max(4_000),
  limit: z.coerce.number().int().min(1).max(20).optional(),
}).strict();

export const agentMemoryWikiSearchResultSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revisionHash: z.string(),
  space: z.enum(['wiki', 'raw', 'generated']),
  title: z.string(),
  path: z.string(),
  excerpt: z.string(),
  score: z.number(),
  canonicalUrl: z.string().url(),
});

export const agentMemoryWikiSearchResponseSchema = z.object({
  results: z.array(agentMemoryWikiSearchResultSchema),
  coverage: agentMemoryWikiCoverageSchema,
});

export const agentMemoryWikiPageReadInputSchema = z.object({
  maxChars: z.coerce.number().int().min(1).max(20_000).default(8_000),
}).strict();

export type AgentMemoryRecallInput = z.infer<typeof agentMemoryRecallInputSchema>;
export type AgentMemorySaveInput = z.infer<typeof agentMemorySaveInputSchema>;
export type AgentMemoryEvidenceInput = z.infer<typeof agentMemoryEvidenceInputSchema>;
export type AgentMemoryRecord = z.infer<typeof agentMemoryRecordSchema>;
export type AgentMemorySourceDocumentInput = z.infer<typeof agentMemorySourceDocumentInputSchema>;
