import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { DomainError } from '@/server/errors';

const services = vi.hoisted(() => ({
  listProposals: vi.fn(),
  getProposalDetail: vi.fn(),
  approveProposal: vi.fn(),
  rejectProposal: vi.fn(),
  applyProposal: vi.fn(),
}));
vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: { kind: 'user', userId: 'admin', role: 'admin' } })),
}));
vi.mock('@/server/services/ai-tool-proposals', () => services);

import * as listRoute from './route';
import * as detailRoute from './[id]/route';
import * as approveRoute from './[id]/approve/route';
import * as rejectRoute from './[id]/reject/route';
import * as applyRoute from './[id]/apply/route';

const ID = '11111111-1111-1111-1111-111111111111';
const params = { params: Promise.resolve({ id: ID }) };

function req(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
    headers: { 'content-type': 'application/json' },
  });
}

describe('AI tool proposal routes', () => {
  beforeEach(() => Object.values(services).forEach((fn) => fn.mockReset()));

  it('lists proposals with query filters', async () => {
    services.listProposals.mockResolvedValue({ items: [], total: 0 });
    const response = await listRoute.GET(new NextRequest('http://localhost/api/ai/tool-proposals?status=pending'));
    expect(response.status).toBe(200);
    expect(services.listProposals).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'pending' }));
  });

  it('returns a proposal detail', async () => {
    services.getProposalDetail.mockResolvedValue({ id: ID, status: 'pending' });
    const response = await detailRoute.GET(new NextRequest(`http://localhost/api/ai/tool-proposals/${ID}`), params);
    expect(response.status).toBe(200);
    expect(services.getProposalDetail).toHaveBeenCalledWith(expect.anything(), ID);
  });

  it('approves, rejects, and applies through the service', async () => {
    services.approveProposal.mockResolvedValue({ id: ID, status: 'approved' });
    services.rejectProposal.mockResolvedValue({ id: ID, status: 'rejected' });
    services.applyProposal.mockResolvedValue({ proposalId: ID, status: 'applied', items: [] });

    expect((await approveRoute.POST(req(`http://localhost/x`), params)).status).toBe(200);
    expect((await rejectRoute.POST(req(`http://localhost/x`, { note: 'n' }), params)).status).toBe(200);
    const applyResponse = await applyRoute.POST(new NextRequest('http://localhost/x', { method: 'POST' }), params);
    expect(applyResponse.status).toBe(200);
    expect(services.applyProposal).toHaveBeenCalledWith(expect.anything(), ID);
  });

  it('maps a conflict to 409 and forbidden to 403', async () => {
    services.applyProposal.mockRejectedValue(new DomainError('PROPOSAL_CONFLICT', 'conflict'));
    expect((await applyRoute.POST(new NextRequest('http://localhost/x', { method: 'POST' }), params)).status).toBe(409);
    services.getProposalDetail.mockRejectedValue(new DomainError('FORBIDDEN', 'no'));
    expect((await detailRoute.GET(new NextRequest('http://localhost/x'), params)).status).toBe(403);
  });
});
