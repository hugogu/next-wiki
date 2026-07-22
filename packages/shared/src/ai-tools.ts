import { z } from 'zod';

/**
 * Shared contract for the Wiki AI Tool Runtime (026).
 *
 * These schemas are the single source of truth for the governed tool provider,
 * tool policy, tool-call, change-proposal, and evidence-link shapes exchanged
 * between the tool runtime services, the REST route handlers, and the Admin /
 * chat UI. The Drizzle enums in `apps/web/src/server/db/schema/enums.ts` mirror
 * the enum values defined here; `ai-tools.test.ts` guards the two against drift.
 */

// ---- Provider identity ------------------------------------------------------

/** Kind of tool provider. Only `builtin_wiki` is activatable in this phase; the
 * external MCP kind is modeled now so future providers reuse the same policy
 * surface without a schema change. */
export const aiToolProviderKindSchema = z.enum(['builtin_wiki', 'external_mcp']);
export type AiToolProviderKind = z.infer<typeof aiToolProviderKindSchema>;

/** Whether a provider can currently be used. `future_external` marks a provider
 * kind that is intentionally visible but non-activatable in this phase. */
export const aiToolActivationStatusSchema = z.enum([
  'available',
  'disabled',
  'unsupported',
  'future_external',
]);
export type AiToolActivationStatus = z.infer<typeof aiToolActivationStatusSchema>;

/** Stable provider key of the built-in wiki tool provider. */
export const BUILTIN_TOOL_PROVIDER_KEY = 'next-wiki';

// ---- Tool taxonomy ----------------------------------------------------------

/** Coarse capability grouping used for Admin policy and risk defaults. */
export const aiToolCategorySchema = z.enum([
  'read',
  'page_draft',
  'metadata',
  'tag',
  'batch',
  'raw_evidence',
]);
export type AiToolCategory = z.infer<typeof aiToolCategorySchema>;

/** Mutation risk of a single tool, ordered from least to most durable. */
export const aiToolRiskLevelSchema = z.enum([
  'read',
  'draft_write',
  'reviewed_write',
  'immediate_write',
]);
export type AiToolRiskLevel = z.infer<typeof aiToolRiskLevelSchema>;

/** How much of a tool result may be retained in Conversation records. Full
 * arbitrary results are never retained; durable-source output must become Raw
 * evidence. */
export const aiToolResultRetentionSchema = z.enum([
  'conversation_summary',
  'raw_when_durable',
  'never_full_result',
]);
export type AiToolResultRetention = z.infer<typeof aiToolResultRetentionSchema>;

/** Default review disposition declared on a static tool definition. */
export const aiToolDefaultReviewPolicySchema = z.enum([
  'always_review',
  'policy_review',
  'allow_immediate',
]);
export type AiToolDefaultReviewPolicy = z.infer<typeof aiToolDefaultReviewPolicySchema>;

/** Admin-managed review policy for a provider/category/tool. Strictest
 * applicable policy wins during server-side resolution. */
export const aiToolReviewPolicySchema = z.enum([
  'always_review',
  'review_when_requested',
  'allow_immediate_for_owner',
]);
export type AiToolReviewPolicy = z.infer<typeof aiToolReviewPolicySchema>;

// ---- Review decision --------------------------------------------------------

/** Review disposition requested by the assistant, or computed by the server.
 * `effectiveReview` can only be stricter than `requestedReview`. */
export const aiToolReviewDecisionSchema = z.enum(['none', 'admin_review']);
export type AiToolReviewDecision = z.infer<typeof aiToolReviewDecisionSchema>;

// ---- Workflow & tool-call lifecycle ----------------------------------------

export const aiToolWorkflowStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_review',
  'completed',
  'failed',
  'cancelled',
  'limit_reached',
]);
export type AiToolWorkflowStatus = z.infer<typeof aiToolWorkflowStatusSchema>;

export const aiToolCallStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'cancelled',
]);
export type AiToolCallStatus = z.infer<typeof aiToolCallStatusSchema>;

// ---- Proposals --------------------------------------------------------------

export const aiToolProposalKindSchema = z.enum([
  'tag_update',
  'metadata_update',
  'batch_update',
  'raw_evidence_link',
  'other',
]);
export type AiToolProposalKind = z.infer<typeof aiToolProposalKindSchema>;

export const aiToolProposalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'applied',
  'failed',
  'superseded',
]);
export type AiToolProposalStatus = z.infer<typeof aiToolProposalStatusSchema>;

export const aiToolProposalItemResourceKindSchema = z.enum([
  'page',
  'tag',
  'page_metadata',
  'raw_category',
  'link',
]);
export type AiToolProposalItemResourceKind = z.infer<typeof aiToolProposalItemResourceKindSchema>;

export const aiToolProposalItemApplyStatusSchema = z.enum([
  'pending',
  'applied',
  'failed',
  'skipped',
]);
export type AiToolProposalItemApplyStatus = z.infer<typeof aiToolProposalItemApplyStatusSchema>;

// ---- Evidence ---------------------------------------------------------------

export const aiToolEvidenceTargetKindSchema = z.enum([
  'page_revision',
  'proposal',
  'tag_mutation',
  'metadata_change',
]);
export type AiToolEvidenceTargetKind = z.infer<typeof aiToolEvidenceTargetKindSchema>;

/** Stable system key for the Raw category that holds tool-derived evidence. */
export const TOOL_EVIDENCE_RAW_SYSTEM_KEY = 'tool-evidence';

// ---- Bounded numeric guards -------------------------------------------------

export const TOOL_MAX_CALLS_PER_TURN_MIN = 1;
export const TOOL_MAX_CALLS_PER_TURN_MAX = 50;
export const TOOL_TIMEOUT_MS_MIN = 1_000;
export const TOOL_TIMEOUT_MS_MAX = 120_000;

// ---- API views: provider & tool listing ------------------------------------

export const aiToolProviderViewSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  kind: aiToolProviderKindSchema,
  enabled: z.boolean(),
  activationStatus: aiToolActivationStatusSchema,
});
export type AiToolProviderView = z.infer<typeof aiToolProviderViewSchema>;

export const aiToolViewSchema = z.object({
  providerKey: z.string(),
  name: z.string(),
  category: aiToolCategorySchema,
  riskLevel: aiToolRiskLevelSchema,
  requiredScope: z.string(),
  enabled: z.boolean(),
  reviewPolicy: aiToolReviewPolicySchema,
  resultRetention: aiToolResultRetentionSchema,
  /** Effective review disposition after server policy resolution. */
  effectiveReview: aiToolReviewDecisionSchema,
  description: z.string().nullable().optional(),
});
export type AiToolView = z.infer<typeof aiToolViewSchema>;

export const aiToolListResponseSchema = z.object({
  providers: z.array(aiToolProviderViewSchema),
  tools: z.array(aiToolViewSchema),
});
export type AiToolListResponse = z.infer<typeof aiToolListResponseSchema>;

// ---- API input: policy update ----------------------------------------------

export const aiToolPolicyUpdateSchema = z
  .object({
    providerKey: z.string().min(1).max(100),
    category: aiToolCategorySchema.nullable().optional(),
    toolName: z.string().min(1).max(200).nullable().optional(),
    enabled: z.boolean().optional(),
    reviewPolicy: aiToolReviewPolicySchema.optional(),
    maxCallsPerTurn: z
      .number()
      .int()
      .min(TOOL_MAX_CALLS_PER_TURN_MIN)
      .max(TOOL_MAX_CALLS_PER_TURN_MAX)
      .optional(),
    timeoutMs: z.number().int().min(TOOL_TIMEOUT_MS_MIN).max(TOOL_TIMEOUT_MS_MAX).optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined ||
      value.reviewPolicy !== undefined ||
      value.maxCallsPerTurn !== undefined ||
      value.timeoutMs !== undefined,
    { message: 'At least one policy field must be provided.' },
  );
export type AiToolPolicyUpdate = z.infer<typeof aiToolPolicyUpdateSchema>;

export const aiToolPolicyViewSchema = z.object({
  id: z.string().uuid(),
  providerKey: z.string(),
  category: aiToolCategorySchema.nullable(),
  toolName: z.string().nullable(),
  enabled: z.boolean(),
  reviewPolicy: aiToolReviewPolicySchema,
  maxCallsPerTurn: z.number().int(),
  timeoutMs: z.number().int(),
  updatedBy: z.string().uuid().nullable(),
  updatedAt: z.string(),
});
export type AiToolPolicyView = z.infer<typeof aiToolPolicyViewSchema>;

// ---- Chat submission: additive `tools` option -------------------------------

export const aiToolChatOptionSchema = z.object({
  enabled: z.boolean().default(false),
  requestedReview: aiToolReviewDecisionSchema.default('none'),
});
export type AiToolChatOption = z.infer<typeof aiToolChatOptionSchema>;

// ---- Common tool-call envelope ----------------------------------------------

/** Assistant-provided part of a tool call request. */
export const aiToolCallRequestSchema = z.object({
  toolName: z.string().min(1).max(200),
  arguments: z.record(z.string(), z.unknown()).default({}),
  requestedReview: aiToolReviewDecisionSchema.default('none'),
});
export type AiToolCallRequest = z.infer<typeof aiToolCallRequestSchema>;

// ---- Action event payloads --------------------------------------------------

/** Payload of a `tool_call` action event. Safe for the initiating user after
 * permission filtering; never carries full arbitrary result payloads. */
export const aiToolCallEventPayloadSchema = z.object({
  toolCallId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  providerKey: z.string(),
  toolName: z.string(),
  category: aiToolCategorySchema.optional(),
  commandMarkdown: z.string(),
  status: aiToolCallStatusSchema,
  requestedReview: aiToolReviewDecisionSchema,
  effectiveReview: aiToolReviewDecisionSchema,
  resultSummary: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  proposalId: z.string().uuid().nullable().optional(),
  evidencePageId: z.string().uuid().nullable().optional(),
});
export type AiToolCallEventPayload = z.infer<typeof aiToolCallEventPayloadSchema>;

/** Payload of a `tool_proposal` action event. */
export const aiToolProposalEventPayloadSchema = z.object({
  proposalId: z.string().uuid(),
  kind: aiToolProposalKindSchema,
  status: aiToolProposalStatusSchema,
  title: z.string(),
  url: z.string(),
});
export type AiToolProposalEventPayload = z.infer<typeof aiToolProposalEventPayloadSchema>;

/** Payload of a `tool_evidence` action event. */
export const aiToolEvidenceEventPayloadSchema = z.object({
  toolCallId: z.string().uuid(),
  targetKind: aiToolEvidenceTargetKindSchema,
  /** Permission-filtered link to the Raw evidence entry, or null when the
   * viewer may not read it. */
  evidenceUrl: z.string().nullable(),
});
export type AiToolEvidenceEventPayload = z.infer<typeof aiToolEvidenceEventPayloadSchema>;

// ---- Proposal API views -----------------------------------------------------

export const aiToolProposalItemViewSchema = z.object({
  id: z.string().uuid(),
  resourceKind: aiToolProposalItemResourceKindSchema,
  resourceId: z.string().uuid().nullable(),
  resourceLabel: z.string().nullable(),
  beforeState: z.record(z.string(), z.unknown()),
  afterState: z.record(z.string(), z.unknown()),
  applyStatus: aiToolProposalItemApplyStatusSchema,
  hasConflict: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type AiToolProposalItemView = z.infer<typeof aiToolProposalItemViewSchema>;

export const aiToolEvidenceLinkViewSchema = z.object({
  id: z.string().uuid(),
  targetKind: aiToolEvidenceTargetKindSchema,
  /** Permission-filtered: null when the viewer may not read the evidence. */
  evidenceUrl: z.string().nullable(),
  contentHash: z.string().nullable(),
});
export type AiToolEvidenceLinkView = z.infer<typeof aiToolEvidenceLinkViewSchema>;

export const aiToolProposalSummarySchema = z.object({
  id: z.string().uuid(),
  kind: aiToolProposalKindSchema,
  status: aiToolProposalStatusSchema,
  title: z.string(),
  createdByUserId: z.string().uuid().nullable(),
  reviewedByUserId: z.string().uuid().nullable(),
  reviewedAt: z.string().nullable(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AiToolProposalSummary = z.infer<typeof aiToolProposalSummarySchema>;

export const aiToolProposalDetailSchema = aiToolProposalSummarySchema.extend({
  rationale: z.string(),
  requestedReview: aiToolReviewDecisionSchema,
  effectiveReview: aiToolReviewDecisionSchema,
  workflowId: z.string().uuid().nullable(),
  toolCallId: z.string().uuid().nullable(),
  sourceToolName: z.string().nullable(),
  hasConflict: z.boolean(),
  items: z.array(aiToolProposalItemViewSchema),
  evidenceLinks: z.array(aiToolEvidenceLinkViewSchema),
});
export type AiToolProposalDetail = z.infer<typeof aiToolProposalDetailSchema>;

export const aiToolProposalListResponseSchema = z.object({
  items: z.array(aiToolProposalSummarySchema),
  total: z.number().int().nonnegative(),
});
export type AiToolProposalListResponse = z.infer<typeof aiToolProposalListResponseSchema>;

export const aiToolProposalListQuerySchema = z.object({
  status: aiToolProposalStatusSchema.optional(),
  kind: aiToolProposalKindSchema.optional(),
  providerKey: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type AiToolProposalListQuery = z.infer<typeof aiToolProposalListQuerySchema>;

// ---- Proposal decision inputs -----------------------------------------------

export const aiToolProposalDecisionInputSchema = z.object({
  note: z.string().max(2_000).optional(),
});
export type AiToolProposalDecisionInput = z.infer<typeof aiToolProposalDecisionInputSchema>;

export const aiToolProposalApplyResultSchema = z.object({
  proposalId: z.string().uuid(),
  status: aiToolProposalStatusSchema,
  items: z.array(
    z.object({
      id: z.string().uuid(),
      applyStatus: aiToolProposalItemApplyStatusSchema,
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
    }),
  ),
});
export type AiToolProposalApplyResult = z.infer<typeof aiToolProposalApplyResultSchema>;

// ---- Domain error codes -----------------------------------------------------

export const aiToolErrorCodeSchema = z.enum([
  'TOOLS_DISABLED',
  'TOOL_NOT_ENABLED',
  'TOOL_CAPABILITY_UNAVAILABLE',
  'TOOL_POLICY_REVIEW_REQUIRED',
  'TOOL_LOOP_LIMIT_REACHED',
  'TOOL_RESULT_TOO_LARGE',
  'TOOL_EVIDENCE_REQUIRED',
  'PROPOSAL_CONFLICT',
  'PROPOSAL_NOT_APPLICABLE',
  'EXTERNAL_PROVIDER_NOT_ACTIVATABLE',
]);
export type AiToolErrorCode = z.infer<typeof aiToolErrorCodeSchema>;
