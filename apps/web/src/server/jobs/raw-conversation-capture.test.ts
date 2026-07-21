import { vi } from 'vitest';

const capture = vi.hoisted(() => ({ captureConversation: vi.fn() }));
vi.mock('@/server/services/raw-conversations', () => capture);
const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@/server/logger', () => ({ logger: log }));
const audit = vi.hoisted(() => ({ writeEntry: vi.fn() }));
vi.mock('@/server/services/audit', () => audit);

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
    audit.writeEntry.mockReset();
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
    capture.captureConversation.mockResolvedValue({
      status: 'captured',
      pageId: 'page-1',
      channel: 'wiki-ai',
      actorUserId: 'user-1',
      correlationId: null,
    });
    await runRawConversationCapture({ actionId: 'action-1' });
    expect(capture.captureConversation).toHaveBeenCalledWith('action-1');
  });

  it('logs a warning (but does not throw) and skips the audit write when capture reports a failure', async () => {
    capture.captureConversation.mockResolvedValue({ status: 'failed', error: 'boom' });
    await expect(runRawConversationCapture({ actionId: 'action-1' })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({ actionId: 'action-1', error: 'boom' }),
    );
    expect(audit.writeEntry).not.toHaveBeenCalled();
  });

  it('does not swallow an unexpected throw from captureConversation (lets pg-boss retry)', async () => {
    capture.captureConversation.mockRejectedValue(new Error('db unavailable'));
    await expect(runRawConversationCapture({ actionId: 'action-1' })).rejects.toThrow('db unavailable');
  });

  it('registers a stable, dedicated queue name', () => {
    expect(QUEUES.rawConversationCapture).toBe('raw-conversation-capture');
  });

  it('writes an audit entry with origin=feishu for a Feishu-channel capture (025, US6)', async () => {
    capture.captureConversation.mockResolvedValue({
      status: 'captured',
      pageId: 'page-1',
      channel: 'feishu',
      actorUserId: 'user-1',
      correlationId: 'corr-abc',
    });
    await runRawConversationCapture({ actionId: 'action-1' });
    expect(audit.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        origin: 'feishu',
        externalCorrelationId: 'corr-abc',
        path: 'raw-conversation-capture:action-1',
        entryType: 'page',
      }),
    );
  });

  it('writes an audit entry with origin=web for a wiki-ai-channel capture', async () => {
    capture.captureConversation.mockResolvedValue({
      status: 'captured',
      pageId: 'page-1',
      channel: 'wiki-ai',
      actorUserId: 'user-1',
      correlationId: null,
    });
    await runRawConversationCapture({ actionId: 'action-2' });
    expect(audit.writeEntry).toHaveBeenCalledWith(expect.objectContaining({ origin: 'web', externalCorrelationId: null }));
  });

  it('never includes raw question, answer, or credential text in the audit entry', async () => {
    capture.captureConversation.mockResolvedValue({
      status: 'captured',
      pageId: 'page-1',
      channel: 'feishu',
      actorUserId: 'user-1',
      correlationId: 'corr-safe',
    });
    await runRawConversationCapture({ actionId: 'action-1' });
    const entry = audit.writeEntry.mock.calls[0]![0];
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/appSecret|apiKey/i);
  });
});
