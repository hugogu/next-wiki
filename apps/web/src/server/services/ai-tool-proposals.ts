import { and, count, desc, eq } from 'drizzle-orm';
import {
  type AiToolProposalApplyResult,
  type AiToolProposalDecisionInput,
  type AiToolProposalDetail,
  type AiToolProposalItemApplyStatus,
  type AiToolProposalItemView,
  type AiToolProposalItemResourceKind,
  type AiToolProposalKind,
  type AiToolProposalListQuery,
  type AiToolProposalListResponse,
  type AiToolProposalStatus,
  type AiToolProposalSummary,
  type AiToolReviewDecision,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { auditProposalApply, auditProposalDecision } from '@/server/services/audit';
import * as content from '@/server/services/public-content';
import * as tags from '@/server/services/tags';

/**
 * Change-proposal persistence primitives and state-transition guards (026, R5).
 * A proposal captures a reviewable mutation that a page draft cannot represent
 * (tag/metadata/batch/raw-evidence changes) as typed before/after items. This
 * module owns creation, transitions, and read/mapping; conflict detection and
 * the permission-re-checked apply/reject flow are added in US3.
 */

export type ProposalRow = typeof schema.aiToolChangeProposals.$inferSelect;
export type ProposalItemRow = typeof schema.aiToolChangeProposalItems.$inferSelect;

// ---- Transition guards ------------------------------------------------------

const PROPOSAL_TRANSITIONS: Record<AiToolProposalStatus, AiToolProposalStatus[]> = {
  pending: ['approved', 'rejected', 'superseded'],
  approved: ['applied', 'failed', 'superseded'],
  rejected: [],
  applied: [],
  failed: ['approved', 'rejected'],
  superseded: [],
};

export function canTransitionProposal(from: AiToolProposalStatus, to: AiToolProposalStatus): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

export function assertProposalTransition(from: AiToolProposalStatus, to: AiToolProposalStatus): void {
  if (!canTransitionProposal(from, to)) {
    throw new Error(`Illegal tool proposal transition: ${from} -> ${to}`);
  }
}

// ---- Creation ---------------------------------------------------------------

export type ProposalItemInput = {
  resourceKind: AiToolProposalItemResourceKind;
  resourceId?: string | null;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  baseVersionId?: string | null;
  stateHash?: string;
};

export async function createProposal(input: {
  kind: AiToolProposalKind;
  title: string;
  rationale?: string;
  workflowId?: string | null;
  toolCallId?: string | null;
  createdByActionId?: string | null;
  createdByUserId?: string | null;
  requestedReview?: AiToolReviewDecision;
  effectiveReview?: AiToolReviewDecision;
  items: ProposalItemInput[];
}): Promise<ProposalRow> {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(schema.aiToolChangeProposals)
      .values({
        kind: input.kind,
        title: input.title,
        rationale: input.rationale ?? '',
        workflowId: input.workflowId ?? null,
        toolCallId: input.toolCallId ?? null,
        createdByActionId: input.createdByActionId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        requestedReview: input.requestedReview ?? 'admin_review',
        effectiveReview: input.effectiveReview ?? 'admin_review',
        status: 'pending',
      })
      .returning();
    if (input.items.length > 0) {
      await tx.insert(schema.aiToolChangeProposalItems).values(
        input.items.map((item) => ({
          proposalId: proposal!.id,
          resourceKind: item.resourceKind,
          resourceId: item.resourceId ?? null,
          beforeState: item.beforeState,
          afterState: item.afterState,
          baseVersionId: item.baseVersionId ?? null,
          stateHash: item.stateHash ?? '',
          applyStatus: 'pending' as const,
        })),
      );
    }
    return proposal!;
  });
}

// ---- Transitions ------------------------------------------------------------

export async function transitionProposal(
  id: string,
  to: AiToolProposalStatus,
  patch: Partial<typeof schema.aiToolChangeProposals.$inferInsert> = {},
): Promise<ProposalRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.aiToolChangeProposals.findFirst({
      where: eq(schema.aiToolChangeProposals.id, id),
    });
    if (!current) throw new Error(`Tool proposal ${id} not found`);
    assertProposalTransition(current.status, to);
    const [row] = await tx
      .update(schema.aiToolChangeProposals)
      .set({ status: to, ...patch })
      .where(eq(schema.aiToolChangeProposals.id, id))
      .returning();
    return row!;
  });
}

// ---- Reads ------------------------------------------------------------------

export async function getProposalRow(id: string): Promise<ProposalRow | undefined> {
  return db.query.aiToolChangeProposals.findFirst({
    where: eq(schema.aiToolChangeProposals.id, id),
  });
}

export async function getProposalItems(proposalId: string): Promise<ProposalItemRow[]> {
  return db
    .select()
    .from(schema.aiToolChangeProposalItems)
    .where(eq(schema.aiToolChangeProposalItems.proposalId, proposalId));
}

export async function listProposalRows(
  query: AiToolProposalListQuery,
): Promise<{ rows: ProposalRow[]; total: number }> {
  const filters = [
    query.status ? eq(schema.aiToolChangeProposals.status, query.status) : undefined,
    query.kind ? eq(schema.aiToolChangeProposals.kind, query.kind) : undefined,
    query.actorUserId ? eq(schema.aiToolChangeProposals.createdByUserId, query.actorUserId) : undefined,
  ].filter((clause): clause is NonNullable<typeof clause> => clause != null);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(schema.aiToolChangeProposals)
      .where(where)
      .orderBy(desc(schema.aiToolChangeProposals.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(schema.aiToolChangeProposals).where(where),
  ]);
  return { rows, total: totalRow?.value ?? 0 };
}

// ---- Mappers ----------------------------------------------------------------

export function toProposalSummary(row: ProposalRow): AiToolProposalSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    createdByUserId: row.createdByUserId,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function itemHasConflict(item: ProposalItemRow): boolean {
  return item.applyStatus === 'failed' && item.errorCode === 'PROPOSAL_CONFLICT';
}

export function toProposalItemView(item: ProposalItemRow): AiToolProposalItemView {
  const before = (item.beforeState ?? {}) as Record<string, unknown>;
  const after = (item.afterState ?? {}) as Record<string, unknown>;
  const label =
    typeof after.label === 'string'
      ? after.label
      : typeof before.label === 'string'
        ? before.label
        : null;
  return {
    id: item.id,
    resourceKind: item.resourceKind,
    resourceId: item.resourceId,
    resourceLabel: label,
    beforeState: before,
    afterState: after,
    applyStatus: item.applyStatus,
    hasConflict: itemHasConflict(item),
    errorCode: item.errorCode,
    errorMessage: item.errorMessage,
  };
}

/**
 * Build the full detail view. Evidence links are resolved by the evidence
 * service (US5); callers pass the already permission-filtered links.
 */
export function toProposalDetail(
  row: ProposalRow,
  items: ProposalItemRow[],
  evidenceLinks: AiToolProposalDetail['evidenceLinks'] = [],
  sourceToolName: string | null = null,
): AiToolProposalDetail {
  const itemViews = items.map(toProposalItemView);
  return {
    ...toProposalSummary(row),
    rationale: row.rationale,
    requestedReview: row.requestedReview,
    effectiveReview: row.effectiveReview,
    workflowId: row.workflowId,
    toolCallId: row.toolCallId,
    sourceToolName,
    hasConflict: itemViews.some((item) => item.hasConflict),
    items: itemViews,
    evidenceLinks,
  };
}

// ---- Review & apply (US3) ---------------------------------------------------

/** Proposal review is gated on AI-tool management; every *apply* additionally
 * re-checks the reviewer's own permission on the target resource through the
 * underlying service call, so approval never expands the initiator's rights. */
function assertProposalReviewer(ctx: PermCtx): void {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access is required to review tool proposals');
  }
}

export async function listProposals(
  ctx: PermCtx,
  query: AiToolProposalListQuery,
): Promise<AiToolProposalListResponse> {
  assertProposalReviewer(ctx);
  const { rows, total } = await listProposalRows(query);
  return { items: rows.map(toProposalSummary), total };
}

async function sourceToolNameOf(toolCallId: string | null): Promise<string | null> {
  if (!toolCallId) return null;
  const call = await db.query.aiToolCalls.findFirst({ where: eq(schema.aiToolCalls.id, toolCallId) });
  return call?.toolName ?? null;
}

export async function getProposalDetail(ctx: PermCtx, id: string): Promise<AiToolProposalDetail> {
  assertProposalReviewer(ctx);
  const row = await getProposalRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'Proposal not found');
  const items = await getProposalItems(id);
  const sourceToolName = await sourceToolNameOf(row.toolCallId);
  // Evidence links are permission-filtered and attached by the evidence service
  // (US5); until then a proposal detail carries no evidence links.
  return toProposalDetail(row, items, [], sourceToolName);
}

export async function approveProposal(
  ctx: PermCtx,
  id: string,
  _input: AiToolProposalDecisionInput = {},
): Promise<AiToolProposalDetail> {
  assertProposalReviewer(ctx);
  const row = await getProposalRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'Proposal not found');
  if (!canTransitionProposal(row.status, 'approved')) {
    throw new DomainError('PROPOSAL_NOT_APPLICABLE', `A ${row.status} proposal cannot be approved`);
  }
  await transitionProposal(id, 'approved', {
    reviewedByUserId: getActorUserId(ctx),
    reviewedAt: new Date(),
  });
  await auditProposalDecision(getActorUserId(ctx), { proposalId: id, decision: 'approved' });
  return getProposalDetail(ctx, id);
}

export async function rejectProposal(
  ctx: PermCtx,
  id: string,
  _input: AiToolProposalDecisionInput = {},
): Promise<AiToolProposalDetail> {
  assertProposalReviewer(ctx);
  const row = await getProposalRow(id);
  if (!row) throw new DomainError('NOT_FOUND', 'Proposal not found');
  if (!canTransitionProposal(row.status, 'rejected')) {
    throw new DomainError('PROPOSAL_NOT_APPLICABLE', `A ${row.status} proposal cannot be rejected`);
  }
  await transitionProposal(id, 'rejected', {
    reviewedByUserId: getActorUserId(ctx),
    reviewedAt: new Date(),
  });
  await auditProposalDecision(getActorUserId(ctx), { proposalId: id, decision: 'rejected' });
  return getProposalDetail(ctx, id);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Apply one proposal item under the reviewer's own `PermCtx`. Interprets the
 * captured `after_state` per item kind and routes through the existing
 * permission-checked, cache-invalidating service. A concurrency error from the
 * service (the resource changed since the proposal was prepared) is surfaced as
 * `PROPOSAL_CONFLICT` rather than silently overwriting.
 */
async function applyItem(
  ctx: PermCtx,
  proposal: ProposalRow,
  item: ProposalItemRow,
): Promise<{ status: AiToolProposalItemApplyStatus; errorCode: string | null; errorMessage: string | null }> {
  const after = (item.afterState ?? {}) as Record<string, unknown>;
  try {
    if (item.resourceKind === 'tag') {
      if (str(after.mergedInto) && item.resourceId) {
        await tags.requestTagMerge(ctx, item.resourceId, str(after.mergedInto)!);
      } else if (after.retired === true && item.resourceId) {
        await tags.requestTagMutation(ctx, item.resourceId, 'delete');
      } else if (item.resourceId) {
        await tags.requestTagMutation(ctx, item.resourceId, 'rename', str(after.name));
      } else {
        await tags.createTag(ctx, str(after.name) ?? '');
      }
    } else if (item.resourceKind === 'page' && proposal.kind === 'tag_update' && item.resourceId) {
      await content.setPageTags(ctx, item.resourceId, Array.isArray(after.tags) ? (after.tags as string[]) : []);
    } else if (item.resourceKind === 'page' && item.resourceId) {
      await content.updateProperties(ctx, item.resourceId, { title: str(after.title), path: str(after.path) });
    } else if (item.resourceKind === 'page_metadata' && item.resourceId) {
      const page = await content.getPageById(ctx, item.resourceId, ['latestRevision']);
      if (!page?.latestRevision) throw new DomainError('NOT_FOUND', 'Page has no revision to update');
      await content.updatePageMetadata(ctx, item.resourceId, {
        baseRevisionId: page.latestRevision.id,
        date: str(after.date) ?? null,
        summary: str(after.summary) ?? null,
        tags: Array.isArray(after.tags) ? (after.tags as string[]) : null,
      });
    } else {
      return { status: 'skipped', errorCode: null, errorMessage: 'Unsupported item kind' };
    }
    return { status: 'applied', errorCode: null, errorMessage: null };
  } catch (error) {
    if (error instanceof DomainError) {
      const conflict = ['STALE_REVISION', 'CONFLICT', 'PAGE_PATH_CONFLICT', 'REVISION_ALREADY_PUBLISHED'];
      if (conflict.includes(error.code)) {
        return { status: 'failed', errorCode: 'PROPOSAL_CONFLICT', errorMessage: 'Current state changed since this proposal was prepared.' };
      }
      return { status: 'failed', errorCode: error.code, errorMessage: error.message };
    }
    return { status: 'failed', errorCode: 'TOOL_FAILED', errorMessage: 'Could not apply this item.' };
  }
}

/**
 * Apply an approved proposal. Re-checks reviewer permission (per item, via the
 * service) and resource state, records per-item results, and moves the proposal
 * to `applied` (all items applied) or `failed` (any item failed). Public page
 * changes invalidate public content through the normal service path.
 */
export async function applyProposal(ctx: PermCtx, id: string): Promise<AiToolProposalApplyResult> {
  assertProposalReviewer(ctx);
  const proposal = await getProposalRow(id);
  if (!proposal) throw new DomainError('NOT_FOUND', 'Proposal not found');
  if (proposal.status !== 'approved') {
    throw new DomainError('PROPOSAL_NOT_APPLICABLE', 'Only an approved proposal can be applied');
  }
  const items = await getProposalItems(id);
  const results: AiToolProposalApplyResult['items'] = [];
  let applied = 0;
  let failed = 0;
  for (const item of items) {
    const result = await applyItem(ctx, proposal, item);
    await db
      .update(schema.aiToolChangeProposalItems)
      .set({ applyStatus: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage })
      .where(eq(schema.aiToolChangeProposalItems.id, item.id));
    if (result.status === 'applied') applied += 1;
    if (result.status === 'failed') failed += 1;
    results.push({ id: item.id, applyStatus: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage });
  }
  const status: AiToolProposalStatus = failed > 0 ? 'failed' : 'applied';
  await transitionProposal(id, status, {
    appliedAt: status === 'applied' ? new Date() : null,
    reviewedByUserId: getActorUserId(ctx),
  });
  await auditProposalApply(getActorUserId(ctx), { proposalId: id, applied, failed });
  return { proposalId: id, status, items: results };
}
