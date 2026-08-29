import { describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({ runEvidenceCapture: vi.fn() }));
vi.mock('@/server/services/agent-memory-captures', () => capture);
const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/server/logger', () => ({ logger: log }));
vi.mock('@/server/cache/public-cache', () => ({
  runWithoutDataCache: (operation: () => unknown) => operation(),
}));

import { isCaptureJobData, runAgentMemoryCapture } from './agent-memory-capture';

const captureId = '3d6f0a9b-6a2b-4a9d-9e3e-1ddc7f7a1c12';
const validPayload = { captureId };

describe('isCaptureJobData', () => {
  it('accepts a well-formed payload', () => {
    expect(isCaptureJobData(validPayload)).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    [{}],
    [{ captureId: 'not-a-uuid' }],
    // The job payload is capture-ID-only; evidence content must never appear here.
    [{ captureId, messages: [{ role: 'user', content: 'should not be here' }] }],
  ])('rejects malformed payload %j', (data) => {
    expect(isCaptureJobData(data)).toBe(false);
  });
});

describe('runAgentMemoryCapture', () => {
  it('does not pass malformed queue data to the service', async () => {
    await runAgentMemoryCapture({ captureId: 'not-a-uuid' });
    expect(capture.runEvidenceCapture).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('malformed job payload'));
  });

  it('passes validated queue data to the service', async () => {
    await runAgentMemoryCapture(validPayload);
    expect(capture.runEvidenceCapture).toHaveBeenCalledWith(validPayload);
  });

  it('does not swallow service failures so pg-boss can retry', async () => {
    capture.runEvidenceCapture.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(runAgentMemoryCapture(validPayload)).rejects.toThrow('database unavailable');
  });
});
