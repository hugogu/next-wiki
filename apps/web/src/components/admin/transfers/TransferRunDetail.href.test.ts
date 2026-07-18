// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TransferItemView } from '@next-wiki/shared';
import { importedPageHref } from './TransferRunDetail';

function item(overrides: Partial<TransferItemView>): TransferItemView {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    runId: '00000000-0000-0000-0000-000000000001',
    kind: 'page',
    sourceKey: '1',
    displayName: 'zh/astronomy/supernovae',
    targetKey: '00000000-0000-0000-0000-0000000000aa',
    action: 'create',
    status: 'completed',
    bytesTotal: null,
    bytesProcessed: 0,
    warningCode: null,
    warningMessage: null,
    errorCode: null,
    errorMessage: null,
    metadata: {},
    attempts: 1,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe('importedPageHref', () => {
  it('links a created page, stripping the leading locale segment', () => {
    expect(importedPageHref(item({}))).toBe('/astronomy/supernovae');
  });

  it('encodes path segments', () => {
    expect(importedPageHref(item({ displayName: 'en/a b/c' }))).toBe('/a%20b/c');
  });

  it('returns null without a target page id (nothing was written)', () => {
    expect(importedPageHref(item({ targetKey: null }))).toBeNull();
  });

  it('returns null for non-page items (e.g. assets)', () => {
    expect(importedPageHref(item({ kind: 'asset' }))).toBeNull();
  });

  it('returns null when the display name has no path after the locale', () => {
    expect(importedPageHref(item({ displayName: 'zh' }))).toBeNull();
  });
});
