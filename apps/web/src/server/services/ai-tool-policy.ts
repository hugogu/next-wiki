import { eq } from 'drizzle-orm';
import {
  BUILTIN_TOOL_PROVIDER_KEY,
  type AiToolListResponse,
  type AiToolReviewDecision,
  type AiToolReviewPolicy,
  type AiToolView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, type PermCtx } from '@/server/permissions';
import {
  BUILTIN_PROVIDER,
  isReadOnlyTool,
  listToolDefinitions,
  type ToolDefinition,
} from '@/server/services/ai-tool-registry';

/**
 * Server-enforced review-policy resolution (026, R4). The model may *request*
 * whether a mutating tool call needs review, but the effective decision is
 * always computed here from tool risk, the strictest applicable Admin policy,
 * the actor, and a per-tool system minimum. The effective decision can only be
 * equal to or stricter than what the assistant requested.
 */

export type ToolPolicyRow = typeof schema.aiToolPolicies.$inferSelect;

/** The three policy scopes that can apply to one tool, most specific last. */
export type PolicyLayers = {
  providerDefault?: Pick<ToolPolicyRow, 'enabled' | 'reviewPolicy' | 'maxCallsPerTurn' | 'timeoutMs'>;
  category?: Pick<ToolPolicyRow, 'enabled' | 'reviewPolicy' | 'maxCallsPerTurn' | 'timeoutMs'>;
  tool?: Pick<ToolPolicyRow, 'enabled' | 'reviewPolicy' | 'maxCallsPerTurn' | 'timeoutMs'>;
};

const REVIEW_POLICY_STRICTNESS: Record<AiToolReviewPolicy, number> = {
  review_when_requested: 0,
  allow_immediate_for_owner: 1,
  always_review: 2,
};

function stricterPolicy(a: AiToolReviewPolicy, b: AiToolReviewPolicy): AiToolReviewPolicy {
  return REVIEW_POLICY_STRICTNESS[a] >= REVIEW_POLICY_STRICTNESS[b] ? a : b;
}

/** Unconfigured default review policy implied by the static tool definition. */
export function toolBaselineReviewPolicy(tool: ToolDefinition): AiToolReviewPolicy {
  if (isReadOnlyTool(tool)) return 'review_when_requested';
  switch (tool.defaultReviewPolicy) {
    case 'always_review':
      return 'always_review';
    case 'policy_review':
    case 'allow_immediate':
      return 'review_when_requested';
  }
}

/**
 * The loosest review policy an Admin may set for a tool. Read tools have no
 * floor; other mutating tools may be loosened at most to owner-immediate so a
 * non-owner mutation is never applied without review; evidence capture may be
 * loosened to review-when-requested.
 */
export function systemMinimumReviewPolicy(tool: ToolDefinition): AiToolReviewPolicy {
  if (isReadOnlyTool(tool) || tool.category === 'raw_evidence') return 'review_when_requested';
  return 'allow_immediate_for_owner';
}

/** Pure resolution of the effective review policy for a tool from its layers. */
export function resolveEffectiveReviewPolicy(tool: ToolDefinition, layers: PolicyLayers): AiToolReviewPolicy {
  const present = [layers.providerDefault, layers.category, layers.tool]
    .filter((layer): layer is NonNullable<typeof layer> => layer != null)
    .map((layer) => layer.reviewPolicy);
  const floor = systemMinimumReviewPolicy(tool);
  if (present.length === 0) return toolBaselineReviewPolicy(tool);
  // Strictest present admin layer wins, but never loosened below the floor.
  const strictest = present.reduce((acc, policy) => stricterPolicy(acc, policy), present[0]!);
  return stricterPolicy(strictest, floor);
}

/** Pure resolution of whether a tool is usable given its layers + provider flag. */
export function resolveToolEnabled(tool: ToolDefinition, layers: PolicyLayers, providerEnabled: boolean): boolean {
  if (!providerEnabled) return false;
  return [layers.providerDefault, layers.category, layers.tool].every((layer) => layer?.enabled !== false);
}

/**
 * Pure resolution of the effective review DECISION for a single tool call.
 * Read tools never require review. The decision is the strictest of the
 * effective policy's implication and the assistant's requested review.
 */
export function resolveReviewDecision(
  tool: ToolDefinition,
  effectiveReviewPolicy: AiToolReviewPolicy,
  requestedReview: AiToolReviewDecision,
  isOwnerOrAdmin: boolean,
): AiToolReviewDecision {
  if (isReadOnlyTool(tool)) return 'none';
  const policyImplied: AiToolReviewDecision = (() => {
    switch (effectiveReviewPolicy) {
      case 'always_review':
        return 'admin_review';
      case 'allow_immediate_for_owner':
        return isOwnerOrAdmin ? 'none' : 'admin_review';
      case 'review_when_requested':
        return 'none';
    }
  })();
  // Strictest of policy-implied and assistant-requested.
  return policyImplied === 'admin_review' || requestedReview === 'admin_review' ? 'admin_review' : 'none';
}

// ---- DB primitives ----------------------------------------------------------

/** Find-or-create the built-in provider row. Idempotent under concurrency. */
export async function ensureBuiltinProvider(): Promise<typeof schema.aiToolProviders.$inferSelect> {
  const existing = await db.query.aiToolProviders.findFirst({
    where: eq(schema.aiToolProviders.key, BUILTIN_TOOL_PROVIDER_KEY),
  });
  if (existing) return existing;
  try {
    const [row] = await db
      .insert(schema.aiToolProviders)
      .values({
        key: BUILTIN_PROVIDER.key,
        displayName: BUILTIN_PROVIDER.displayName,
        kind: BUILTIN_PROVIDER.kind,
        enabled: true,
        activationStatus: 'available',
      })
      .returning();
    if (!row) throw new Error('Failed to create built-in tool provider');
    return row;
  } catch (error) {
    const again = await db.query.aiToolProviders.findFirst({
      where: eq(schema.aiToolProviders.key, BUILTIN_TOOL_PROVIDER_KEY),
    });
    if (again) return again;
    throw error;
  }
}

export async function getPolicyRowsByProvider(providerId: string): Promise<ToolPolicyRow[]> {
  return db.select().from(schema.aiToolPolicies).where(eq(schema.aiToolPolicies.providerId, providerId));
}

/** Assemble the layers that apply to one tool from a provider's policy rows. */
export function policyLayersFor(tool: ToolDefinition, rows: ToolPolicyRow[]): PolicyLayers {
  return {
    providerDefault: rows.find((row) => row.toolName == null && row.category == null),
    category: rows.find((row) => row.toolName == null && row.category === tool.category),
    tool: rows.find((row) => row.toolName === tool.name),
  };
}

/**
 * Full tool listing with effective policy for the Admin Tools surface (US1).
 * Admin-only. Ensures the built-in provider exists on first read.
 */
export async function listToolsWithEffectivePolicy(ctx: PermCtx): Promise<AiToolListResponse> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access is required to manage AI tools');
  }
  const provider = await ensureBuiltinProvider();
  const rows = await getPolicyRowsByProvider(provider.id);
  const tools: AiToolView[] = listToolDefinitions().map((tool) => {
    const layers = policyLayersFor(tool, rows);
    const reviewPolicy = resolveEffectiveReviewPolicy(tool, layers);
    return {
      providerKey: provider.key,
      name: tool.name,
      category: tool.category,
      riskLevel: tool.riskLevel,
      requiredScope: tool.requiredScope,
      enabled: resolveToolEnabled(tool, layers, provider.enabled),
      reviewPolicy,
      resultRetention: tool.resultRetention,
      effectiveReview: resolveReviewDecision(tool, reviewPolicy, 'none', false),
      description: tool.description,
    };
  });
  return {
    providers: [
      {
        key: provider.key,
        displayName: provider.displayName,
        kind: provider.kind,
        enabled: provider.enabled,
        activationStatus: provider.activationStatus,
      },
      // Future external MCP provider, modeled but never activatable this phase.
      {
        key: 'external-mcp',
        displayName: 'External MCP',
        kind: 'external_mcp',
        enabled: false,
        activationStatus: 'future_external',
      },
    ],
    tools,
  };
}
