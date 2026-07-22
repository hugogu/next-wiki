import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { buildUserCtx, type PermCtx } from '@/server/permissions';

const content = vi.hoisted(() => ({
  setPageTags: vi.fn(),
  updateProperties: vi.fn(),
  updatePageMetadata: vi.fn(),
  getPageById: vi.fn(),
}));
const tagsSvc = vi.hoisted(() => ({
  requestTagMutation: vi.fn(),
  requestTagMerge: vi.fn(),
  createTag: vi.fn(),
}));
vi.mock('@/server/services/public-content', () => content);
vi.mock('@/server/services/tags', () => tagsSvc);

import {
  applyProposal,
  approveProposal,
  assertProposalTransition,
  canTransitionProposal,
  createProposal,
  getProposalItems,
  getProposalRow,
  listProposalRows,
  rejectProposal,
  toProposalDetail,
  transitionProposal,
} from '@/server/services/ai-tool-proposals';

const readerCtx = buildUserCtx('reader-1', 'reader');

describe('ai tool proposals — transition guards', () => {
  it('permits the documented proposal transitions and rejects others', () => {
    expect(canTransitionProposal('pending', 'approved')).toBe(true);
    expect(canTransitionProposal('pending', 'rejected')).toBe(true);
    expect(canTransitionProposal('approved', 'applied')).toBe(true);
    expect(canTransitionProposal('failed', 'approved')).toBe(true);
    expect(canTransitionProposal('applied', 'approved')).toBe(false);
    expect(canTransitionProposal('rejected', 'approved')).toBe(false);
    expect(() => assertProposalTransition('applied', 'approved')).toThrow();
  });
});

describe('ai tool proposals — persistence', () => {
  it('creates a proposal with typed before/after items', async () => {
    const proposal = await createProposal({
      kind: 'tag_update',
      title: 'Retag 2 pages',
      rationale: 'Consolidate payment routing tags',
      items: [
        {
          resourceKind: 'tag',
          beforeState: { label: 'pay-routing', name: 'pay-routing' },
          afterState: { label: 'payment-routing', name: 'payment-routing' },
          stateHash: 'hash-1',
        },
        {
          resourceKind: 'page',
          beforeState: { tags: ['pay-routing'] },
          afterState: { tags: ['payment-routing'] },
        },
      ],
    });
    expect(proposal.status).toBe('pending');
    const items = await getProposalItems(proposal.id);
    expect(items).toHaveLength(2);
    const detail = toProposalDetail(proposal, items);
    expect(detail.items[0]?.resourceLabel).toBe('payment-routing');
    expect(detail.hasConflict).toBe(false);
  });

  it('drives a proposal pending -> approved -> applied and rejects illegal moves', async () => {
    const proposal = await createProposal({ kind: 'metadata_update', title: 'Update summary', items: [] });
    const approved = await transitionProposal(proposal.id, 'approved', { reviewedAt: new Date() });
    expect(approved.status).toBe('approved');
    const applied = await transitionProposal(proposal.id, 'applied', { appliedAt: new Date() });
    expect(applied.status).toBe('applied');
    await expect(transitionProposal(proposal.id, 'approved')).rejects.toThrow();
    expect((await getProposalRow(proposal.id))?.status).toBe('applied');
  });

  it('lists proposals filtered by status', async () => {
    const pending = await createProposal({ kind: 'tag_update', title: 'A', items: [] });
    const other = await createProposal({ kind: 'tag_update', title: 'B', items: [] });
    await transitionProposal(other.id, 'rejected');
    const result = await listProposalRows({ status: 'pending', limit: 20, offset: 0 });
    expect(result.rows.map((row) => row.id)).toContain(pending.id);
    expect(result.rows.map((row) => row.id)).not.toContain(other.id);
  });
});

describe('ai tool proposals — review & apply (US3)', () => {
  let adminCtx: PermCtx;

  beforeEach(async () => {
    const [admin] = await db
      .insert(schema.users)
      .values({ email: `prop-admin-${crypto.randomUUID()}@example.com`, passwordHash: 'HASH', role: 'admin', status: 'active' })
      .returning({ id: schema.users.id });
    adminCtx = buildUserCtx(admin!.id, 'admin');
  });

  it('denies review to a non-admin', async () => {
    const proposal = await createProposal({ kind: 'tag_update', title: 'x', items: [] });
    await expect(approveProposal(readerCtx, proposal.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(applyProposal(readerCtx, proposal.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a proposal without mutating durable state', async () => {
    const proposal = await createProposal({
      kind: 'tag_update',
      title: 'Retag',
      items: [{ resourceKind: 'tag', resourceId: crypto.randomUUID(), beforeState: {}, afterState: { name: 'n' } }],
    });
    const detail = await rejectProposal(adminCtx, proposal.id, { note: 'no' });
    expect(detail.status).toBe('rejected');
    expect(tagsSvc.requestTagMutation).not.toHaveBeenCalled();
  });

  it('only applies an approved proposal', async () => {
    const proposal = await createProposal({ kind: 'tag_update', title: 'x', items: [] });
    await expect(applyProposal(adminCtx, proposal.id)).rejects.toMatchObject({ code: 'PROPOSAL_NOT_APPLICABLE' });
  });

  it('applies an approved tag rename through the reviewer permission-checked service', async () => {
    tagsSvc.requestTagMutation.mockResolvedValue(undefined);
    const tagId = crypto.randomUUID();
    const proposal = await createProposal({
      kind: 'tag_update',
      title: 'Rename tag',
      items: [{ resourceKind: 'tag', resourceId: tagId, beforeState: {}, afterState: { name: 'renamed' } }],
    });
    await approveProposal(adminCtx, proposal.id);
    const result = await applyProposal(adminCtx, proposal.id);
    expect(result.status).toBe('applied');
    expect(result.items[0]?.applyStatus).toBe('applied');
    expect(tagsSvc.requestTagMutation).toHaveBeenCalledWith(adminCtx, tagId, 'rename', 'renamed');
  });

  it('surfaces a concurrency error as PROPOSAL_CONFLICT instead of overwriting', async () => {
    content.getPageById.mockResolvedValue({ id: 'p', latestRevision: { id: 'rev-1' } });
    content.updatePageMetadata.mockRejectedValue(new DomainError('STALE_REVISION', 'stale'));
    const proposal = await createProposal({
      kind: 'metadata_update',
      title: 'Update metadata',
      items: [
        { resourceKind: 'page_metadata', resourceId: crypto.randomUUID(), beforeState: {}, afterState: { summary: 'new' } },
      ],
    });
    await approveProposal(adminCtx, proposal.id);
    const result = await applyProposal(adminCtx, proposal.id);
    expect(result.status).toBe('failed');
    expect(result.items[0]?.applyStatus).toBe('failed');
    expect(result.items[0]?.errorCode).toBe('PROPOSAL_CONFLICT');
    const reloaded = await getProposalRow(proposal.id);
    expect(reloaded?.status).toBe('failed');
  });
});
