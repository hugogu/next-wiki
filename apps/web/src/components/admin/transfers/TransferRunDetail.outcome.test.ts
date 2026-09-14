// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TransferRunView } from '@next-wiki/shared';
import type { TranslationKey } from '@/i18n';
import { runOutcomeCounts } from './TransferRunDetail';

/** Identity translator: assertions read on the key, not on catalog wording. */
const t = (key: TranslationKey) => key;

function run(overrides: Partial<TransferRunView> = {}): TransferRunView {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    kind: 'wikijs_import',
    status: 'completed',
    phase: 'completed',
    actorUserId: null,
    sourceId: null,
    sourceArtifactId: null,
    previewRunId: null,
    options: {},
    sourceFingerprint: null,
    totalItems: 1,
    processedItems: 1,
    createdItems: 0,
    replacedItems: 1,
    skippedItems: 0,
    convertedItems: 0,
    warningItems: 0,
    failedItems: 0,
    currentItem: null,
    cancelRequested: false,
    pauseRequested: false,
    errorCode: null,
    errorMessage: null,
    errorDetail: null,
    reportArtifactId: null,
    cleanedAt: null,
    queuedAt: '2026-09-14T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    expiresAt: '2026-09-15T00:00:00.000Z',
    canCancel: false,
    canRetry: false,
    canPause: false,
    canResume: false,
    canCleanup: false,
    ...overrides,
  };
}

describe('runOutcomeCounts', () => {
  it('reports created/replaced/skipped for an import', () => {
    expect(runOutcomeCounts(run(), t)).toEqual([
      { label: 'admin.transfers.detail.outcome.created', value: 0 },
      { label: 'admin.transfers.detail.outcome.replaced', value: 1 },
      { label: 'admin.transfers.detail.outcome.skipped', value: 0 },
    ]);
  });

  it('keeps a zero count visible — an all-zero run is the case worth explaining', () => {
    const counts = runOutcomeCounts(run({ createdItems: 0, replacedItems: 0, skippedItems: 1 }), t);
    expect(counts.map((entry) => entry.value)).toEqual([0, 0, 1]);
  });

  it('adds converted only when the source needed a conversion pass', () => {
    expect(runOutcomeCounts(run(), t)).toHaveLength(3);
    const withConversions = runOutcomeCounts(run({ convertedItems: 4 }), t);
    expect(withConversions).toHaveLength(4);
    expect(withConversions[3]).toEqual({ label: 'admin.transfers.detail.outcome.converted', value: 4 });
  });

  it('reports counts for previews and archive runs too', () => {
    for (const kind of ['wikijs_preview', 'archive_preview', 'archive_import'] as const) {
      expect(runOutcomeCounts(run({ kind }), t)).toHaveLength(3);
    }
  });

  it('renders nothing for kinds that never record an outcome', () => {
    expect(runOutcomeCounts(run({ kind: 'wikijs_source_test', totalItems: 1694 }), t)).toEqual([]);
    expect(runOutcomeCounts(run({ kind: 'site_export' }), t)).toEqual([]);
  });
});
