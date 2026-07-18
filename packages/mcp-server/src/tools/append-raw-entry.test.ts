import { describe, expect, it, vi } from 'vitest';
import type { WikiApiClient } from '../api-client';
import { WikiApiClientError } from '../api-client';
import { appendRawEntry } from './append-raw-entry';

describe('append_raw_entry', () => {
  const pageId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('flattens the immutable appended revision and source metadata', async () => {
    const client = {
      appendRawEntry: vi.fn().mockResolvedValue({
        id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        pageId,
        version: 2,
        status: 'published',
        contentType: 'text/markdown',
        contentHash: 'hash',
        author: { id: null, displayName: null },
        createdAt: '2026-07-18T00:00:00.000Z',
        publishedAt: '2026-07-18T00:00:00.000Z',
        canPublish: false,
        origin: { actorKind: 'machine', nature: 'original' },
        source: { channel: 'support', sessionId: 'case-42' },
      }),
    } as unknown as WikiApiClient;

    const result = await appendRawEntry(client, {
      pageId,
      content: 'Follow-up',
      source: { channel: 'support', sessionId: 'case-42' },
    });

    expect(result).toMatchObject({
      revisionId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      version: 2,
      origin: { actorKind: 'machine', nature: 'original' },
      source: { channel: 'support', sessionId: 'case-42' },
    });
  });

  it('returns pending-switch errors without rewriting them', async () => {
    const pending = new WikiApiClientError('Writing mode switch is in progress', 409, 'MODE_SWITCH_IN_PROGRESS');
    const client = {
      appendRawEntry: vi.fn().mockRejectedValue(pending),
    } as unknown as WikiApiClient;

    await expect(appendRawEntry(client, { pageId, content: 'Follow-up' })).rejects.toBe(pending);
  });
});
