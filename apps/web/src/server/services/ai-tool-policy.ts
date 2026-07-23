import { and, eq, isNull } from 'drizzle-orm';
import {
  BUILTIN_TOOL_PROVIDER_KEY,
  type AiToolCategory,
  type AiToolListResponse,
  type AiToolPolicyUpdate,
  type AiToolPolicyView,
  type AiToolReviewDecision,
  type AiToolReviewPolicy,
  type AiToolView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { auditToolPolicyChange } from '@/server/services/audit';
import {
  BUILTIN_PROVIDER,
  getToolDefinition,
  isReadOnlyTool,
  listToolDefinitions,
  listToolsByCategory,
  type ToolDefinition,
} from '@/server/services/ai-tool-registry';

/**
 * Server-enforced review-policy resolution (026, R4). The model may *request*
 * whether a mutating tool call needs review, but the effective decision is
 * always computed here from tool risk, the strictest applicable Admin policy,
 * the actor, and a per-tool system minimum. Admin-initiated calls bypass review
 * because the initiating actor is already authorized to perform that review.
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
 * Read tools and Admin-initiated calls never require review. For other actors,
 * the decision is the strictest of policy and the assistant's request.
 */
export function resolveReviewDecision(
  tool: ToolDefinition,
  effectiveReviewPolicy: AiToolReviewPolicy,
  requestedReview: AiToolReviewDecision,
  isOwnerOrAdmin: boolean,
): AiToolReviewDecision {
  if (isReadOnlyTool(tool)) return 'none';
  // An Admin is already the reviewer of record. Sending their own mutations
  // through an Admin-review proposal adds no governance value and can strand
  // otherwise authorized bot actions waiting on the initiating user.
  if (isOwnerOrAdmin) return 'none';
  const policyImplied: AiToolReviewDecision = (() => {
    switch (effectiveReviewPolicy) {
      case 'always_review':
        return 'admin_review';
      case 'allow_immediate_for_owner':
        return 'admin_review';
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

// ---- Policy update (US1) ----------------------------------------------------

function toolsInScope(input: AiToolPolicyUpdate): ToolDefinition[] {
  if (input.toolName) {
    const tool = getToolDefinition(input.toolName);
    return tool ? [tool] : [];
  }
  if (input.category) return listToolsByCategory(input.category);
  return listToolDefinitions();
}

/** Loosest review policy allowed for a whole scope: the strictest floor among
 * its mutating tools, so loosening a category never drops below any member. */
function scopeReviewFloor(tools: ToolDefinition[]): AiToolReviewPolicy {
  const mutating = tools.filter((tool) => !isReadOnlyTool(tool));
  if (mutating.length === 0) return 'review_when_requested';
  return mutating
    .map((tool) => systemMinimumReviewPolicy(tool))
    .reduce((acc, policy) => stricterPolicy(acc, policy), 'review_when_requested' as AiToolReviewPolicy);
}

function toPolicyView(row: ToolPolicyRow, providerKey: string): AiToolPolicyView {
  return {
    id: row.id,
    providerKey,
    category: row.category,
    toolName: row.toolName,
    enabled: row.enabled,
    reviewPolicy: row.reviewPolicy,
    maxCallsPerTurn: row.maxCallsPerTurn,
    timeoutMs: row.timeoutMs,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Update the Admin-managed policy for a provider default, a category, or a
 * single tool. External providers can never be activated in this phase; a
 * requested review policy is clamped up to the scope's system minimum so a
 * mutating category can never be made less restrictive than allowed. The change
 * is audit-logged.
 */
export async function updateToolPolicy(ctx: PermCtx, input: AiToolPolicyUpdate): Promise<AiToolPolicyView> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access is required to manage AI tools');
  }
  if (input.providerKey !== BUILTIN_TOOL_PROVIDER_KEY) {
    throw new DomainError(
      'EXTERNAL_PROVIDER_NOT_ACTIVATABLE',
      'External tool providers cannot be configured in this phase',
    );
  }
  const scopeTools = toolsInScope(input);
  if (input.toolName && scopeTools.length === 0) {
    throw new DomainError('BAD_REQUEST', `Unknown tool: ${input.toolName}`);
  }
  const provider = await ensureBuiltinProvider();
  const category: AiToolCategory | null = input.toolName ? null : (input.category ?? null);
  const toolName = input.toolName ?? null;

  // Clamp a requested review policy up to the scope floor (never looser).
  const clampedReviewPolicy =
    input.reviewPolicy !== undefined
      ? stricterPolicy(input.reviewPolicy, scopeReviewFloor(scopeTools))
      : undefined;

  const scopeWhere = and(
    eq(schema.aiToolPolicies.providerId, provider.id),
    toolName == null
      ? isNull(schema.aiToolPolicies.toolName)
      : eq(schema.aiToolPolicies.toolName, toolName),
    category == null ? isNull(schema.aiToolPolicies.category) : eq(schema.aiToolPolicies.category, category),
  );

  const row = await db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.aiToolPolicies).where(scopeWhere).limit(1);
    const patch = {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(clampedReviewPolicy !== undefined ? { reviewPolicy: clampedReviewPolicy } : {}),
      ...(input.maxCallsPerTurn !== undefined ? { maxCallsPerTurn: input.maxCallsPerTurn } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      updatedBy: getActorUserId(ctx),
      updatedAt: new Date(),
    };
    if (existing[0]) {
      const [updated] = await tx
        .update(schema.aiToolPolicies)
        .set(patch)
        .where(eq(schema.aiToolPolicies.id, existing[0].id))
        .returning();
      return updated!;
    }
    const [inserted] = await tx
      .insert(schema.aiToolPolicies)
      .values({ providerId: provider.id, toolName, category, ...patch })
      .returning();
    return inserted!;
  });

  await auditToolPolicyChange(getActorUserId(ctx), {
    providerKey: provider.key,
    category,
    toolName,
  });
  return toPolicyView(row, provider.key);
}
