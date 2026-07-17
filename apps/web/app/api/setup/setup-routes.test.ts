import { describe, expect, it, vi, beforeEach } from 'vitest';

const actor = vi.hoisted(() => ({ value: { kind: 'anonymous' } as unknown }));
const services = vi.hoisted(() => ({
  getSetupState: vi.fn(),
  reconcileSetupAi: vi.fn(),
}));

vi.mock('@/server/api/session', () => ({
  createApiContext: vi.fn(async () => ({ actor: actor.value })),
}));
vi.mock('@/server/services/setup', () => ({ getSetupState: services.getSetupState }));
vi.mock('@/server/services/setup-ai', () => ({ reconcileSetupAi: services.reconcileSetupAi }));

import * as setupRoute from './route';

describe('GET /api/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actor.value = { kind: 'anonymous' };
    services.reconcileSetupAi.mockResolvedValue(undefined);
  });

  it('returns the account-needed shape for anonymous callers before an admin exists', async () => {
    services.getSetupState.mockResolvedValue({
      needed: true,
      currentStep: 'account',
      accountStatus: 'needed',
    });
    const response = await setupRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      needed: true,
      currentStep: 'account',
      accountStatus: 'needed',
    });
    expect(services.getSetupState).toHaveBeenCalledWith({ kind: 'anonymous' });
  });

  it('returns the full resumable state for the signed-in admin', async () => {
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
    services.getSetupState.mockResolvedValue({
      needed: true,
      currentStep: 'ai',
      accountStatus: 'created',
      aiStatus: 'not_started',
      samplePagesStatus: 'not_started',
      summary: { adminCreated: true, ai: null, samplePages: null },
    });
    const response = await setupRoute.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currentStep).toBe('ai');
    expect(body.summary.adminCreated).toBe(true);
  });

  it('returns the closed shape after setup completes', async () => {
    services.getSetupState.mockResolvedValue({ needed: false, currentStep: 'closed' });
    const response = await setupRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needed: false, currentStep: 'closed' });
  });

  it('reconciles in-flight AI bootstrap before reading state', async () => {
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
    services.getSetupState.mockResolvedValue({ needed: true, currentStep: 'ai', accountStatus: 'created' });
    await setupRoute.GET();
    expect(services.reconcileSetupAi).toHaveBeenCalledWith(actor.value);
  });

  it('survives reconcile failures and still returns state', async () => {
    services.reconcileSetupAi.mockRejectedValue(new Error('boom'));
    services.getSetupState.mockResolvedValue({ needed: true, currentStep: 'account', accountStatus: 'needed' });
    const response = await setupRoute.GET();
    expect(response.status).toBe(200);
  });

  it('is not cached', async () => {
    services.getSetupState.mockResolvedValue({ needed: true, currentStep: 'account', accountStatus: 'needed' });
    const response = await setupRoute.GET();
    expect(response.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/i);
  });
});

describe('setup summary shaping (US4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.reconcileSetupAi.mockResolvedValue(undefined);
  });

  it('summary contains no credentials and includes remaining manual actions', async () => {
    actor.value = { kind: 'user', userId: 'admin-id', role: 'admin' };
    services.getSetupState.mockResolvedValue({
      needed: false,
      currentStep: 'summary',
      accountStatus: 'created',
      aiStatus: 'partial',
      samplePagesStatus: 'completed',
      summary: {
        adminCreated: true,
        ai: {
          wiki_text: { status: 'configured', modelName: 'Chat' },
          wiki_embedding: { status: 'needs_manual_setup', reason: 'No compatible detected model' },
        },
        samplePages: [{ path: 'welcome', status: 'created', pageId: '6f1c2b9e-3f58-4a3c-bf3e-4d3f0d35a003' }],
      },
    });
    const response = await setupRoute.GET();
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('secret');
    expect(raw).toContain('needs_manual_setup');
  });
});
