import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TOOL_PROVIDER_KEY,
  TOOL_EVIDENCE_RAW_SYSTEM_KEY,
  aiToolCallEventPayloadSchema,
  aiToolCategorySchema,
  aiToolChatOptionSchema,
  aiToolPolicyUpdateSchema,
  aiToolProposalDetailSchema,
  aiToolProviderKindSchema,
  aiToolReviewDecisionSchema,
  aiToolReviewPolicySchema,
  aiToolWorkflowStatusSchema,
} from './ai-tools';

describe('ai-tools shared contract', () => {
  it('pins stable provider and evidence keys', () => {
    expect(BUILTIN_TOOL_PROVIDER_KEY).toBe('next-wiki');
    expect(TOOL_EVIDENCE_RAW_SYSTEM_KEY).toBe('tool-evidence');
  });

  it('models external providers without allowing them alongside builtin', () => {
    expect(aiToolProviderKindSchema.options).toEqual(['builtin_wiki', 'external_mcp']);
  });

  it('enumerates the built-in tool categories', () => {
    expect(aiToolCategorySchema.options).toEqual([
      'read',
      'page_draft',
      'metadata',
      'tag',
      'batch',
      'raw_evidence',
    ]);
  });

  it('keeps review decisions to none/admin_review only', () => {
    expect(aiToolReviewDecisionSchema.options).toEqual(['none', 'admin_review']);
  });

  it('defaults the chat tools option to disabled with no review', () => {
    expect(aiToolChatOptionSchema.parse({})).toEqual({ enabled: false, requestedReview: 'none' });
  });

  describe('policy update', () => {
    it('accepts a category-scoped review policy change', () => {
      const parsed = aiToolPolicyUpdateSchema.parse({
        providerKey: 'next-wiki',
        category: 'tag',
        reviewPolicy: 'always_review',
      });
      expect(parsed.reviewPolicy).toBe('always_review');
    });

    it('rejects an update with no policy fields', () => {
      expect(() => aiToolPolicyUpdateSchema.parse({ providerKey: 'next-wiki' })).toThrow();
    });

    it('bounds max calls per turn and timeout', () => {
      expect(aiToolPolicyUpdateSchema.parse({ providerKey: 'next-wiki', maxCallsPerTurn: 100 }).maxCallsPerTurn).toBe(100);
      expect(() =>
        aiToolPolicyUpdateSchema.parse({ providerKey: 'next-wiki', maxCallsPerTurn: 0 }),
      ).toThrow();
      expect(() =>
        aiToolPolicyUpdateSchema.parse({ providerKey: 'next-wiki', maxCallsPerTurn: 101 }),
      ).toThrow();
      expect(() =>
        aiToolPolicyUpdateSchema.parse({ providerKey: 'next-wiki', timeoutMs: 500 }),
      ).toThrow();
    });
  });

  it('validates a tool_call event payload with server-computed review', () => {
    const payload = aiToolCallEventPayloadSchema.parse({
      toolCallId: '00000000-0000-0000-0000-000000000001',
      sequence: 1,
      providerKey: 'next-wiki',
      toolName: 'search_wiki',
      commandMarkdown: '```tool-call\nsearch_wiki\n```',
      status: 'running',
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    expect(payload.status).toBe('running');
  });

  it('validates a full proposal detail shape', () => {
    const detail = aiToolProposalDetailSchema.parse({
      id: '00000000-0000-0000-0000-000000000002',
      kind: 'tag_update',
      status: 'pending',
      title: 'Retag 4 pages',
      rationale: 'Consolidate payment routing tags',
      requestedReview: 'admin_review',
      effectiveReview: 'admin_review',
      workflowId: null,
      toolCallId: null,
      sourceToolName: 'rename_tag',
      createdByUserId: null,
      reviewedByUserId: null,
      reviewedAt: null,
      appliedAt: null,
      createdAt: '2026-07-22T00:00:00.000Z',
      hasConflict: false,
      items: [],
      evidenceLinks: [],
    });
    expect(detail.kind).toBe('tag_update');
  });

  it('exposes the workflow limit_reached terminal state', () => {
    expect(aiToolWorkflowStatusSchema.options).toContain('limit_reached');
    expect(aiToolReviewPolicySchema.options).toContain('allow_immediate_for_owner');
  });
});
