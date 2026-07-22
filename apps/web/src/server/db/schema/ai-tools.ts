import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { aiActions, pageRevisions, pages, users } from './index';
import {
  aiToolActivationStatusEnum,
  aiToolCallStatusEnum,
  aiToolCategoryEnum,
  aiToolEvidenceTargetKindEnum,
  aiToolProposalItemApplyStatusEnum,
  aiToolProposalItemResourceKindEnum,
  aiToolProposalKindEnum,
  aiToolProposalStatusEnum,
  aiToolProviderKindEnum,
  aiToolReviewDecisionEnum,
  aiToolReviewPolicyEnum,
  aiToolWorkflowStatusEnum,
} from './enums';

/**
 * Wiki AI Tool Runtime schema (026).
 *
 * Tool records and proposals are workflow state that explains how AI reached or
 * prepared durable changes. Page content stays canonical in `pages` /
 * `page_revisions`; Raw evidence stays canonical in Raw pages and their
 * revisions. Nothing here stores full arbitrary tool-result payloads.
 */

// ---- Providers & policy -----------------------------------------------------

/** A configured source of tools available to Wiki AI. Only the built-in
 * `next-wiki` provider is activatable in this phase; the row exists so external
 * MCP providers can later reuse the same policy surface. */
export const aiToolProviders = pgTable('ai_tool_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  kind: aiToolProviderKindEnum('kind').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  activationStatus: aiToolActivationStatusEnum('activation_status').notNull().default('available'),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Admin-managed policy for a provider, a category within a provider, or a
 * single tool. Effective policy is resolved server-side as the strictest
 * applicable row layered over static tool defaults. */
export const aiToolPolicies = pgTable(
  'ai_tool_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiToolProviders.id, { onDelete: 'cascade' }),
    // Null tool_name + null category = provider default. Non-null category with
    // null tool_name = category default. Non-null tool_name = tool-specific.
    toolName: text('tool_name'),
    category: aiToolCategoryEnum('category'),
    enabled: boolean('enabled').notNull().default(true),
    reviewPolicy: aiToolReviewPolicyEnum('review_policy').notNull().default('always_review'),
    maxCallsPerTurn: integer('max_calls_per_turn').notNull().default(8),
    timeoutMs: integer('timeout_ms').notNull().default(30_000),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One policy row per (provider, scope). Partial uniques keep provider,
    // category, and tool scopes independent.
    providerDefaultUnique: uniqueIndex('ai_tool_policies_provider_default_unique')
      .on(t.providerId)
      .where(sql`${t.toolName} is null and ${t.category} is null`),
    providerCategoryUnique: uniqueIndex('ai_tool_policies_provider_category_unique')
      .on(t.providerId, t.category)
      .where(sql`${t.toolName} is null and ${t.category} is not null`),
    providerToolUnique: uniqueIndex('ai_tool_policies_provider_tool_unique')
      .on(t.providerId, t.toolName)
      .where(sql`${t.toolName} is not null`),
    boundsCheck: check(
      'ai_tool_policies_bounds',
      sql`${t.maxCallsPerTurn} >= 1 and ${t.maxCallsPerTurn} <= 50 and ${t.timeoutMs} >= 1000 and ${t.timeoutMs} <= 120000`,
    ),
  }),
);

// ---- Tool workflow & calls --------------------------------------------------

/** A tool-enabled chat turn, linked one-to-one to a `wiki_tool_chat` AI action. */
export const aiToolWorkflows = pgTable(
  'ai_tool_workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aiActionId: uuid('ai_action_id')
      .notNull()
      .references(() => aiActions.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: aiToolWorkflowStatusEnum('status').notNull().default('queued'),
    maxCalls: integer('max_calls').notNull().default(8),
    callCount: integer('call_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    actionUnique: uniqueIndex('ai_tool_workflows_action_unique').on(t.aiActionId),
    statusIdx: index('ai_tool_workflows_status_idx').on(t.status),
  }),
);

/** One assistant-requested tool invocation. The full arbitrary result payload is
 * never stored here — only a bounded command record, a safe summary, and (when
 * the result becomes durable evidence) a content hash. */
export const aiToolCalls = pgTable(
  'ai_tool_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => aiToolWorkflows.id, { onDelete: 'cascade' }),
    aiActionId: uuid('ai_action_id')
      .notNull()
      .references(() => aiActions.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    toolName: text('tool_name').notNull(),
    sequence: integer('sequence').notNull(),
    commandMarkdown: text('command_markdown').notNull(),
    arguments: jsonb('arguments').notNull().default({}),
    status: aiToolCallStatusEnum('status').notNull().default('queued'),
    requestedReview: aiToolReviewDecisionEnum('requested_review').notNull().default('none'),
    effectiveReview: aiToolReviewDecisionEnum('effective_review').notNull().default('none'),
    resultSummary: text('result_summary'),
    resultHash: text('result_hash'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    workflowSequenceUnique: uniqueIndex('ai_tool_calls_workflow_sequence_unique').on(
      t.workflowId,
      t.sequence,
    ),
    actionIdx: index('ai_tool_calls_action_idx').on(t.aiActionId),
  }),
);

// ---- Change proposals -------------------------------------------------------

/** A reviewable mutation that a page draft cannot represent (tag renames,
 * metadata updates, batch operations, raw-evidence links). Deliberately durable
 * and self-contained: source workflow/call/action references are nullable and
 * set-null on cleanup so a pending proposal survives AI action expiry. */
export const aiToolChangeProposals = pgTable(
  'ai_tool_change_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id').references(() => aiToolWorkflows.id, { onDelete: 'set null' }),
    toolCallId: uuid('tool_call_id').references(() => aiToolCalls.id, { onDelete: 'set null' }),
    kind: aiToolProposalKindEnum('kind').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull().default(''),
    status: aiToolProposalStatusEnum('status').notNull().default('pending'),
    requestedReview: aiToolReviewDecisionEnum('requested_review').notNull().default('admin_review'),
    effectiveReview: aiToolReviewDecisionEnum('effective_review').notNull().default('admin_review'),
    createdByActionId: uuid('created_by_action_id').references(() => aiActions.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    conflictState: jsonb('conflict_state').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('ai_tool_change_proposals_status_idx').on(t.status, t.createdAt),
    kindIdx: index('ai_tool_change_proposals_kind_idx').on(t.kind),
    actorIdx: index('ai_tool_change_proposals_actor_idx').on(t.createdByUserId),
  }),
);

/** One resource-level before/after item within a proposal. `state_hash` and
 * `base_version_id` drive conflict detection at apply time. */
export const aiToolChangeProposalItems = pgTable(
  'ai_tool_change_proposal_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => aiToolChangeProposals.id, { onDelete: 'cascade' }),
    resourceKind: aiToolProposalItemResourceKindEnum('resource_kind').notNull(),
    resourceId: uuid('resource_id'),
    beforeState: jsonb('before_state').notNull().default({}),
    afterState: jsonb('after_state').notNull().default({}),
    baseVersionId: uuid('base_version_id'),
    stateHash: text('state_hash').notNull().default(''),
    applyStatus: aiToolProposalItemApplyStatusEnum('apply_status').notNull().default('pending'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    proposalIdx: index('ai_tool_change_proposal_items_proposal_idx').on(t.proposalId),
  }),
);

// ---- Evidence links ---------------------------------------------------------

/** Relationship between a producing tool call, a durable change, and its Raw or
 * source evidence. Exactly one of `raw_page_id` / `source_revision_id` is set. */
export const aiToolEvidenceLinks = pgTable(
  'ai_tool_evidence_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toolCallId: uuid('tool_call_id').references(() => aiToolCalls.id, { onDelete: 'set null' }),
    rawPageId: uuid('raw_page_id').references(() => pages.id, { onDelete: 'set null' }),
    sourceRevisionId: uuid('source_revision_id').references(() => pageRevisions.id, {
      onDelete: 'set null',
    }),
    targetKind: aiToolEvidenceTargetKindEnum('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index('ai_tool_evidence_links_target_idx').on(t.targetKind, t.targetId),
    toolCallIdx: index('ai_tool_evidence_links_tool_call_idx').on(t.toolCallId),
    // Exactly one evidence anchor is required.
    evidenceAnchor: check(
      'ai_tool_evidence_links_anchor',
      sql`(${t.rawPageId} is not null) <> (${t.sourceRevisionId} is not null)`,
    ),
  }),
);

// ---- Relations --------------------------------------------------------------

export const aiToolPoliciesRelations = relations(aiToolPolicies, ({ one }) => ({
  provider: one(aiToolProviders, {
    fields: [aiToolPolicies.providerId],
    references: [aiToolProviders.id],
  }),
}));

export const aiToolWorkflowsRelations = relations(aiToolWorkflows, ({ one, many }) => ({
  action: one(aiActions, { fields: [aiToolWorkflows.aiActionId], references: [aiActions.id] }),
  calls: many(aiToolCalls),
}));

export const aiToolCallsRelations = relations(aiToolCalls, ({ one, many }) => ({
  workflow: one(aiToolWorkflows, {
    fields: [aiToolCalls.workflowId],
    references: [aiToolWorkflows.id],
  }),
  evidenceLinks: many(aiToolEvidenceLinks),
}));

export const aiToolChangeProposalsRelations = relations(aiToolChangeProposals, ({ one, many }) => ({
  workflow: one(aiToolWorkflows, {
    fields: [aiToolChangeProposals.workflowId],
    references: [aiToolWorkflows.id],
  }),
  toolCall: one(aiToolCalls, {
    fields: [aiToolChangeProposals.toolCallId],
    references: [aiToolCalls.id],
  }),
  items: many(aiToolChangeProposalItems),
}));

export const aiToolChangeProposalItemsRelations = relations(aiToolChangeProposalItems, ({ one }) => ({
  proposal: one(aiToolChangeProposals, {
    fields: [aiToolChangeProposalItems.proposalId],
    references: [aiToolChangeProposals.id],
  }),
}));

export const aiToolEvidenceLinksRelations = relations(aiToolEvidenceLinks, ({ one }) => ({
  toolCall: one(aiToolCalls, {
    fields: [aiToolEvidenceLinks.toolCallId],
    references: [aiToolCalls.id],
  }),
}));
