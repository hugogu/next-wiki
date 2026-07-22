import { describe, expect, it } from 'vitest';
import {
  assertProposalTransition,
  canTransitionProposal,
  createProposal,
  getProposalItems,
  getProposalRow,
  listProposalRows,
  toProposalDetail,
  transitionProposal,
} from '@/server/services/ai-tool-proposals';

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
