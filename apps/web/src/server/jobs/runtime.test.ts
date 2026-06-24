import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setBoss, enqueue } from './runtime';

const mockSend = vi.fn();
const mockStart = vi.fn();
const mockOn = vi.fn();

vi.mock('./create-boss', () => ({
  createBoss: vi.fn(() => ({ send: mockSend, start: mockStart, on: mockOn })),
}));

vi.mock('@/server/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe('queue runtime', () => {
  beforeEach(() => {
    setBoss(null);
    mockSend.mockReset();
    mockStart.mockReset();
    mockOn.mockReset();
  });

  afterEach(() => {
    setBoss(null);
  });

  it('uses the bootstrapped boss instance when available', async () => {
    mockSend.mockResolvedValueOnce('job-id');
    setBoss({ send: mockSend } as unknown as import('pg-boss').PgBoss);
    const id = await enqueue('git-export', { backendId: 'b1' });
    expect(id).toBe('job-id');
    expect(mockSend).toHaveBeenCalledWith('git-export', { backendId: 'b1' }, undefined);
  });

  it('returns null in non-production environments when no bootstrap instance exists', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    const id = await enqueue('git-export', { backendId: 'b1' });
    expect(id).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts a lazy enqueue-only instance in production when no bootstrap instance exists', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockSend.mockResolvedValueOnce('lazy-job-id');

    const id = await enqueue('git-export', { backendId: 'b1' }, { expireInSeconds: 60 });
    expect(id).toBe('lazy-job-id');
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith('git-export', { backendId: 'b1' }, { expireInSeconds: 60 });

    vi.unstubAllEnvs();
  });
});
