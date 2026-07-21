import { vi } from 'vitest';

const capture = vi.hoisted(() => ({ captureConversation: vi.fn() }));
vi.mock('@/server/services/raw-conversations', () => capture);
const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@/server/logger', () => ({ logger: log }));

import { isRawConversationCaptureJobData, runRawConversationCapture } from './raw-conversation-capture';
import { QUEUES } from '@/server/jobs/runtime';

describe('isRawConversationCaptureJobData', () => {
  it('accepts a well-formed payload', () => {
    expect(isRawConversationCaptureJobData({ actionId: 'abc' })).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ['abc'],
    [{}],
    [{ actionId: 123 }],
    [{ actionId: '' }],
  ])('rejects malformed payload %j', (data) => {
    expect(isRawConversationCaptureJobData(data)).toBe(false);
  });
});

describe('runRawConversationCapture', () => {
  beforeEach(() => {
    capture.captureConversation.mockReset();
    log.warn.mockReset();
  });

  it('logs and does not call captureConversation for a malformed payload', async () => {
    await runRawConversationCapture({ actionId: 42 });
    expect(capture.captureConversation).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('malformed job payload'),
      expect.anything(),
    );
  });

  it('calls captureConversation with the validated actionId', async () => {
    capture.captureConversation.mockResolvedValue({ status: 'captured', pageId: 'page-1' });
    await runRawConversationCapture({ actionId: 'action-1' });
    expect(capture.captureConversation).toHaveBeenCalledWith('action-1');
  });

  it('logs a warning (but does not throw) when capture reports a failure', async () => {
    capture.captureConversation.mockResolvedValue({ status: 'failed', error: 'boom' });
    await expect(runRawConversationCapture({ actionId: 'action-1' })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({ actionId: 'action-1', error: 'boom' }),
    );
  });

  it('does not swallow an unexpected throw from captureConversation (lets pg-boss retry)', async () => {
    capture.captureConversation.mockRejectedValue(new Error('db unavailable'));
    await expect(runRawConversationCapture({ actionId: 'action-1' })).rejects.toThrow('db unavailable');
  });

  it('registers a stable, dedicated queue name', () => {
    expect(QUEUES.rawConversationCapture).toBe('raw-conversation-capture');
  });
});
