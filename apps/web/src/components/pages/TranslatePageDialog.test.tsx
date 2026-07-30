// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TranslationRunItemView, TranslationRunView } from '@next-wiki/shared';

vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { TranslatePageDialog, deriveTranslateOutcome } from './TranslatePageDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function runView(overrides: Partial<TranslationRunView> = {}): TranslationRunView {
  return {
    id: 'run-1',
    targetLocale: 'zh',
    kind: 'initial',
    status: 'completed',
    predecessorRunId: null,
    modelId: null,
    modelName: 'Fixture',
    promptVersionId: null,
    totalItems: 1,
    processedItems: 1,
    completedItems: 1,
    skippedItems: 0,
    failedItems: 0,
    supersededItems: 0,
    currentItem: null,
    usage: { inputTokens: null, outputTokens: null, cachedTokens: null, source: 'unavailable' },
    totalDurationMs: 0,
    cancelRequested: false,
    pauseRequested: false,
    errorCode: null,
    errorMessage: null,
    queuedAt: '2026-07-30T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    canPause: false,
    canResume: false,
    canCancel: false,
    canRetry: false,
    ...overrides,
  };
}

function itemView(overrides: Partial<TranslationRunItemView> = {}): TranslationRunItemView {
  return {
    id: 'item-1',
    runId: 'run-1',
    sourcePageId: 'page-1',
    sourceRevisionId: null,
    translationPageId: null,
    translationRevisionId: null,
    targetLocale: 'zh',
    targetPath: 'guide',
    status: 'completed',
    attempts: 1,
    retryAvailable: false,
    usage: { inputTokens: null, outputTokens: null, cachedTokens: null, source: 'unavailable' },
    durationMs: null,
    warningCode: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe('deriveTranslateOutcome', () => {
  it('reports the published translation with a link to it', () => {
    const outcome = deriveTranslateOutcome(runView(), itemView());
    expect(outcome.tone).toBe('success');
    expect(outcome.messageKey).toBe('page.translate.result.completed');
    expect(outcome.href).toBe('/zh/guide');
  });

  it('reports the item failure reason, not just the run status', () => {
    const outcome = deriveTranslateOutcome(
      runView({ status: 'failed', completedItems: 0, failedItems: 1 }),
      itemView({ status: 'failed', errorCode: 'MODEL_NOT_FOUND', errorMessage: 'AI model was not found' }),
    );
    expect(outcome.tone).toBe('danger');
    expect(outcome.messageKey).toBe('page.translate.result.failed');
    expect(outcome.code).toBe('MODEL_NOT_FOUND');
    expect(outcome.href).toBeNull();
  });

  it('explains a skipped page with its warning code', () => {
    const outcome = deriveTranslateOutcome(
      runView({ status: 'completed_with_warnings' }),
      itemView({ status: 'skipped', warningCode: 'SOURCE_UNAVAILABLE' }),
    );
    expect(outcome.tone).toBe('warning');
    expect(outcome.messageKey).toBe('page.translate.result.skipped');
    expect(outcome.code).toBe('SOURCE_UNAVAILABLE');
  });

  it('explains a superseded page as nothing published', () => {
    const outcome = deriveTranslateOutcome(runView(), itemView({ status: 'superseded' }));
    expect(outcome.messageKey).toBe('page.translate.result.superseded');
    expect(outcome.href).toBeNull();
  });

  it('falls back to the run status when the item outcome is unavailable', () => {
    expect(deriveTranslateOutcome(runView(), null).tone).toBe('success');
    expect(deriveTranslateOutcome(runView({ status: 'cancelled' }), null).messageKey).toBe(
      'page.translate.result.cancelled',
    );
    const infra = deriveTranslateOutcome(
      runView({ status: 'failed', errorCode: 'JOB_QUEUE_UNAVAILABLE', errorMessage: 'no queue' }),
      null,
    );
    expect(infra.tone).toBe('danger');
    expect(infra.code).toBe('JOB_QUEUE_UNAVAILABLE');
  });
});

describe('TranslatePageDialog outcome reporting', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<TranslatePageDialog pageId="page-1" onClose={() => {}} />));
  }

  async function flush() {
    // Let the queued microtasks (config load, POST, first poll) settle.
    for (let i = 0; i < 12; i++) await act(async () => {});
  }

  function stubFetch(run: TranslationRunView, item: TranslationRunItemView | null) {
    const json = (body: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/languages')) {
        return json({ items: [{ code: 'zh', enabled: true, retired: false }] });
      }
      if (url.includes('/models') || url.includes('/prompts')) return json({ items: [] });
      if (url.endsWith('/items')) return json({ items: item ? [item] : [], total: item ? 1 : 0 });
      if (url.includes('/api/translations/runs')) return json(run);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('does not claim success while the run is still queued', async () => {
    stubFetch(runView({ id: 'run-1', status: 'queued' }), null);
    mount();
    await flush();
    act(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    await flush();

    expect(container.textContent).toContain('page.translate.state.queued');
    expect(container.textContent).not.toContain('page.translate.result.completed');
  });

  it('surfaces a failed run with the provider code instead of a success message', async () => {
    stubFetch(
      runView({ status: 'failed', completedItems: 0, failedItems: 1 }),
      itemView({ status: 'failed', errorCode: 'TIMEOUT', errorMessage: 'AI provider response timed out' }),
    );
    mount();
    await flush();
    act(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    await flush();

    expect(container.textContent).toContain('page.translate.result.failed');
    expect(container.textContent).toContain('TIMEOUT');
    expect(container.textContent).not.toContain('page.translate.result.completed');
    // The run stays reachable for a full diagnosis.
    expect(container.querySelector('a[href="/admin/translations/run-1"]')).not.toBeNull();
  });

  it('says a paused run is paused, not that it is still running', async () => {
    stubFetch(runView({ status: 'paused' }), null);
    mount();
    await flush();
    act(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    await flush();

    expect(container.textContent).toContain('page.translate.state.paused');
    expect(container.textContent).not.toContain('page.translate.state.stillRunning');
    expect(container.textContent).not.toContain('page.translate.state.running');
  });

  it('links to the published translation when the page succeeds', async () => {
    stubFetch(runView(), itemView());
    mount();
    await flush();
    act(() => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    });
    await flush();

    expect(container.textContent).toContain('page.translate.result.completed');
    expect(container.querySelector('a[href="/zh/guide"]')).not.toBeNull();
  });
});
