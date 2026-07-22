import { and, count, desc, eq } from 'drizzle-orm';
import {
  type AiToolProposalDetail,
  type AiToolProposalItemView,
  type AiToolProposalItemResourceKind,
  type AiToolProposalKind,
  type AiToolProposalListQuery,
  type AiToolProposalStatus,
  type AiToolProposalSummary,
  type AiToolReviewDecision,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

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
