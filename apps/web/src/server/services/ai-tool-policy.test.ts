import { describe, expect, it } from 'vitest';
import { getToolDefinition } from '@/server/services/ai-tool-registry';
import {
  resolveEffectiveReviewPolicy,
  resolveReviewDecision,
  resolveToolEnabled,
  systemMinimumReviewPolicy,
  toolBaselineReviewPolicy,
  type PolicyLayers,
} from '@/server/services/ai-tool-policy';

const readTool = getToolDefinition('search_wiki')!;
const tagTool = getToolDefinition('rename_tag')!;
const evidenceTool = getToolDefinition('capture_tool_evidence')!;

function layer(overrides: Partial<PolicyLayers['tool']> = {}): NonNullable<PolicyLayers['tool']> {
  return { enabled: true, reviewPolicy: 'always_review', maxCallsPerTurn: 8, timeoutMs: 30_000, ...overrides };
}

describe('ai tool review-policy resolution (026)', () => {
  describe('baseline + floor', () => {
    it('reads never require review; mutations default to always_review', () => {
      expect(toolBaselineReviewPolicy(readTool)).toBe('review_when_requested');
      expect(toolBaselineReviewPolicy(tagTool)).toBe('always_review');
    });

    it('sets the loosest allowed policy per tool risk', () => {
      expect(systemMinimumReviewPolicy(readTool)).toBe('review_when_requested');
      expect(systemMinimumReviewPolicy(tagTool)).toBe('allow_immediate_for_owner');
      expect(systemMinimumReviewPolicy(evidenceTool)).toBe('review_when_requested');
    });
  });

  describe('resolveReviewDecision — Admin bypass and strictest non-Admin policy', () => {
    it('forces no review for read tools regardless of policy or request', () => {
      expect(resolveReviewDecision(readTool, 'always_review', 'admin_review', false)).toBe('none');
    });

    it('lets an Admin execute an unconfigured mutating tool without self-review', () => {
      const policy = resolveEffectiveReviewPolicy(tagTool, {});
      expect(policy).toBe('always_review');
      expect(resolveReviewDecision(tagTool, policy, 'none', true)).toBe('none');
      expect(resolveReviewDecision(tagTool, policy, 'none', false)).toBe('admin_review');
    });

    it('lets an owner act immediately under owner-immediate policy, but reviews others', () => {
      const policy = resolveEffectiveReviewPolicy(tagTool, {
        category: layer({ reviewPolicy: 'allow_immediate_for_owner' }),
      });
      expect(policy).toBe('allow_immediate_for_owner');
      expect(resolveReviewDecision(tagTool, policy, 'none', true)).toBe('none');
      expect(resolveReviewDecision(tagTool, policy, 'none', false)).toBe('admin_review');
    });

    it('ignores an assistant-requested review for an Admin actor', () => {
      const policy = resolveEffectiveReviewPolicy(tagTool, {
        category: layer({ reviewPolicy: 'allow_immediate_for_owner' }),
      });
      expect(resolveReviewDecision(tagTool, policy, 'admin_review', true)).toBe('none');
      expect(resolveReviewDecision(tagTool, policy, 'admin_review', false)).toBe('admin_review');
    });
  });

  describe('resolveEffectiveReviewPolicy — layering', () => {
    it('lets the strictest present admin layer win over a looser one', () => {
      const policy = resolveEffectiveReviewPolicy(tagTool, {
        providerDefault: layer({ reviewPolicy: 'always_review' }),
        category: layer({ reviewPolicy: 'allow_immediate_for_owner' }),
      });
      expect(policy).toBe('always_review');
    });

    it('never loosens a mutating tool below its owner-immediate floor', () => {
      const policy = resolveEffectiveReviewPolicy(tagTool, {
        category: layer({ reviewPolicy: 'review_when_requested' }),
      });
      expect(policy).toBe('allow_immediate_for_owner');
    });

    it('allows evidence capture to be loosened to review-when-requested', () => {
      const policy = resolveEffectiveReviewPolicy(evidenceTool, {
        tool: layer({ reviewPolicy: 'review_when_requested' }),
      });
      expect(policy).toBe('review_when_requested');
    });
  });

  describe('resolveToolEnabled — AND across layers', () => {
    it('disables a tool when the provider is disabled', () => {
      expect(resolveToolEnabled(tagTool, {}, false)).toBe(false);
    });

    it('disables every tool in a disabled category', () => {
      expect(resolveToolEnabled(tagTool, { category: layer({ enabled: false }) }, true)).toBe(false);
    });

    it('enables a tool when the provider and all present layers are enabled', () => {
      expect(resolveToolEnabled(tagTool, { category: layer({ enabled: true }) }, true)).toBe(true);
    });
  });
});
