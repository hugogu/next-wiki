import { describe, expect, it, vi } from 'vitest';
import type { AiConversationDetail, AiConversationSummary } from '@next-wiki/shared';
import { resolveSessionId } from './resolve-session-id';

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
});

function makeConversation(key: string): AiConversationSummary {
  return {
    conversationKey: key,
    latestActionId: '00000000-0000-4000-8000-000000000000',
    latestStatus: 'completed',
    latestQueuedAt: new Date().toISOString(),
    questionExcerpt: 'Q',
    rawConversation: null,
    turnCount: 1,
    completedTurnCount: 1,
    failedTurnCount: 0,
    cancelledTurnCount: 0,
    turnActionIds: ['00000000-0000-4000-8000-000000000000'],
  } as AiConversationSummary;
}

function makeDetail(webSessionId?: string): AiConversationDetail {
  return {
    conversation: makeConversation('key'),
    turns: [{
      action: {
        id: '00000000-0000-4000-8000-000000000000',
        feature: 'wiki_question',
        status: 'completed',
        actorUserId: '00000000-0000-4000-8000-000000000001',
        providerId: null,
        providerName: null,
        modelId: null,
        modelName: null,
        indexGenerationId: null,
        pageId: null,
        pagePath: null,
        pageSpaceSlug: null,
        questionMode: 'retrieval',
        requestMetadata: webSessionId ? { origin: 'web', webSessionId } : { origin: 'web' },
        resultMetadata: {},
        usageMetadata: {},
        errorCode: null,
        errorMessage: null,
        errorDetail: null,
        queuedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        expiresAt: new Date().toISOString(),
        rawConversationPageId: null,
        rawConversationCaptureStatus: 'disabled',
      },
      events: [],
    }],
  } as AiConversationDetail;
}

describe('resolveSessionId', () => {
  it('extracts the webSessionId from a legacy conversation key', () => {
    const id = resolveSessionId(makeConversation('legacy:sess-123'), makeDetail());
    expect(id).toBe('sess-123');
  });

  it('extracts the webSessionId from the latest turn metadata when captured', () => {
    const id = resolveSessionId(makeConversation('raw-page-id'), makeDetail('captured-sess-456'));
    expect(id).toBe('captured-sess-456');
  });

  it('falls back to a fresh UUID for legacy:turn: fallback keys', () => {
    const id = resolveSessionId(makeConversation('legacy:turn:action-id'), makeDetail());
    expect(id).toBe('00000000-0000-4000-8000-000000000000');
  });
});
