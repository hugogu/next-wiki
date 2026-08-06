import { describe, expect, it, vi } from 'vitest';
import {
  computeWikiJsHistoryFingerprint,
  computeWikiJsPageFingerprint,
  normalizeHistoryLimit,
  selectHistoryWindow,
  wikiJsTagNames,
  WikiJsClient,
  type WikiJsHistoryEntry,
} from './wikijs-client';
import { DomainError } from '@/server/errors';

const mocks = vi.hoisted(() => ({ fetchRemote: vi.fn() }));
vi.mock('./remote-fetch', () => ({ fetchRemote: mocks.fetchRemote }));

function jsonResponse(body: unknown) {
  return { bytes: Buffer.from(JSON.stringify(body), 'utf8') };
}

function entry(versionId: number): WikiJsHistoryEntry {
  return { versionId, versionDate: `2026-01-${String(versionId).padStart(2, '0')}T00:00:00.000Z`, authorId: 1, authorName: 'Alice', actionType: 'edit' };
}

describe('Wiki.js tag mapping', () => {
  it('uses display titles and removes blank or case-only duplicates', () => {
    expect(wikiJsTagNames([
      { tag: 'devops', title: 'DevOps' },
      { tag: 'docker' },
      ' devops ',
      ' ',
    ])).toEqual(['DevOps', 'docker']);
  });

  it('includes canonical tag identifiers in the page fingerprint', () => {
    const base = { id: 1, path: 'docs/a', locale: 'en', title: 'A', updatedAt: '2026-07-12' };
    const first = computeWikiJsPageFingerprint({ ...base, tags: ['devops'] });
    const same = computeWikiJsPageFingerprint({ ...base, tags: [{ tag: 'DEVOPS', title: 'Platform' }] });
    const changed = computeWikiJsPageFingerprint({ ...base, tags: ['docker'] });
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });
});

describe('computeWikiJsHistoryFingerprint', () => {
  it('changes when the trail changes and is stable for the same trail', () => {
    const trail = [entry(1), entry(2)];
    const first = computeWikiJsHistoryFingerprint('page-fp', trail);
    const same = computeWikiJsHistoryFingerprint('page-fp', [entry(1), entry(2)]);
    const differentTrail = computeWikiJsHistoryFingerprint('page-fp', [entry(1), entry(2), entry(3)]);
    const differentPage = computeWikiJsHistoryFingerprint('other-fp', trail);
    expect(same).toBe(first);
    expect(differentTrail).not.toBe(first);
    expect(differentPage).not.toBe(first);
  });
});

describe('normalizeHistoryLimit', () => {
  it('passes through a valid in-bounds integer', () => {
    expect(normalizeHistoryLimit(50)).toBe(50);
  });

  it('clamps out-of-bounds values to the 1..2000 range', () => {
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(-5)).toBe(1);
    expect(normalizeHistoryLimit(5000)).toBe(2000);
  });

  it('floors a non-integer value', () => {
    expect(normalizeHistoryLimit(12.9)).toBe(12);
  });

  it('falls back to the default for missing, non-numeric, or non-finite values', () => {
    expect(normalizeHistoryLimit(undefined)).toBe(300);
    expect(normalizeHistoryLimit(null)).toBe(300);
    expect(normalizeHistoryLimit('300')).toBe(300);
    expect(normalizeHistoryLimit(NaN)).toBe(300);
    expect(normalizeHistoryLimit(Infinity)).toBe(300);
  });
});

describe('selectHistoryWindow', () => {
  it('keeps the full trail when it fits within the limit', () => {
    const trail = [entry(1), entry(2), entry(3)];
    expect(selectHistoryWindow(trail, 10)).toEqual({ keep: trail, truncated: false });
    // Exactly at the boundary (trail + current == limit) still fits untruncated.
    expect(selectHistoryWindow(trail, 4)).toEqual({ keep: trail, truncated: false });
  });

  it('reserves one slot for current and one for the oldest starting-point version when truncating', () => {
    const trail = [entry(1), entry(2), entry(3), entry(4), entry(5)]; // total available = 6 (5 + current)
    const { keep, truncated } = selectHistoryWindow(trail, 3); // budget: 1 current + 2 trail
    expect(truncated).toBe(true);
    // 2 trail slots: 1 for the oldest starting point, 1 for the most recent entry.
    expect(keep.map((e) => e.versionId)).toEqual([1, 5]);
  });

  it('keeps only the current version when the limit leaves no room for any history', () => {
    const trail = [entry(1), entry(2)];
    const { keep, truncated } = selectHistoryWindow(trail, 1);
    expect(truncated).toBe(true);
    expect(keep).toEqual([]);
  });
});

describe('WikiJsClient.assertHistoryAccess', () => {
  const client = new WikiJsClient('https://wiki.example.com', 'token', false);

  it('throws WIKIJS_HISTORY_FORBIDDEN when Wiki.js reports a permission error', async () => {
    mocks.fetchRemote.mockReset().mockResolvedValue(
      jsonResponse({ errors: [{ message: 'Insufficient permissions to access this resource (read:history)' }] }),
    );
    let caught: unknown;
    try {
      await client.assertHistoryAccess(1);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe('WIKIJS_HISTORY_FORBIDDEN');
  });

  it('rethrows unrelated errors unchanged', async () => {
    mocks.fetchRemote.mockReset().mockResolvedValue(jsonResponse({ errors: [{ message: 'Page not found' }] }));
    await expect(client.assertHistoryAccess(1)).rejects.toThrow('Page not found');
  });

  it('resolves when the query succeeds', async () => {
    mocks.fetchRemote.mockReset().mockResolvedValue(
      jsonResponse({ data: { pages: { history: { trail: [], total: 0 } } } }),
    );
    await expect(client.assertHistoryAccess(1)).resolves.toBeUndefined();
  });
});

describe('WikiJsClient.listHistory', () => {
  const client = new WikiJsClient('https://wiki.example.com', 'token', false);

  it('pages through the trail and returns it sorted ascending by versionId', async () => {
    mocks.fetchRemote.mockReset();
    mocks.fetchRemote
      .mockResolvedValueOnce(jsonResponse({ data: { pages: { history: { trail: [entry(3), entry(1)], total: 3 } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { pages: { history: { trail: [entry(2)], total: 3 } } } }));
    const trail = await client.listHistory(42);
    expect(trail.map((e) => e.versionId)).toEqual([1, 2, 3]);
    expect(mocks.fetchRemote).toHaveBeenCalledTimes(2);
  });
});
