import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_MIN_INTERVAL_MS,
  PREVIEW_TIMEOUT_MS,
  createPreviewScheduler,
  type PreviewRender,
} from './previewScheduler';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A render whose requests stay open until the test settles them. */
function manualRender() {
  const calls: Array<{
    source: string;
    signal: AbortSignal;
    resolve: (html: string) => void;
    reject: (error: unknown) => void;
  }> = [];
  const render = vi.fn<PreviewRender>(
    (source, signal) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ source, signal, resolve, reject });
      }),
  );
  return { render, calls };
}

/** A render that answers after `ms` of fake time. */
function timedRender(ms: number) {
  const sources: string[] = [];
  const render: PreviewRender = (source) =>
    new Promise((resolve) => {
      sources.push(source);
      setTimeout(() => resolve(`<p>${source}</p>`), ms);
    });
  return { render, sources };
}

/**
 * A server that, like Node rendering Markdown synchronously, works through
 * requests strictly one after another, each costing `costMs`, and cannot skip
 * one a client has already given up on.
 */
function serialServer(costMs: number) {
  let busyUntil = 0;
  let pending = 0;
  let maxPending = 0;
  const render: PreviewRender = (source, signal) =>
    new Promise((resolve, reject) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      busyUntil = Math.max(performance.now(), busyUntil) + costMs;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      });
      setTimeout(() => {
        pending -= 1;
        resolve(`<p>${source}</p>`);
      }, busyUntil - performance.now());
    });
  return { render, maxPending: () => maxPending };
}

describe('createPreviewScheduler', () => {
  it('renders the first source immediately', async () => {
    const { render, calls } = manualRender();
    const onHtml = vi.fn();
    const scheduler = createPreviewScheduler({ render, onHtml });

    scheduler.update('# first');

    expect(render).toHaveBeenCalledTimes(1);
    expect(calls[0]?.source).toBe('# first');
    calls[0]?.resolve('<h1>first</h1>');
    await vi.advanceTimersByTimeAsync(0);
    expect(onHtml).toHaveBeenCalledExactlyOnceWith('<h1>first</h1>');
  });

  it('collapses edits made while a request is in flight into one follow-up with the newest source', async () => {
    const { render, calls } = manualRender();
    const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

    scheduler.update('a');
    scheduler.update('ab');
    scheduler.update('abc');
    scheduler.update('abcd');
    expect(render).toHaveBeenCalledTimes(1);

    calls[0]?.resolve('<p>a</p>');
    await vi.advanceTimersByTimeAsync(PREVIEW_MIN_INTERVAL_MS);

    expect(render).toHaveBeenCalledTimes(2);
    expect(calls[1]?.source).toBe('abcd');
  });

  it('never sends a second request while one is still unanswered', async () => {
    const { render } = manualRender();
    const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

    scheduler.update('a');
    for (let i = 0; i < 100; i += 1) {
      scheduler.update(`a${i}`);
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('waits the minimum interval after a fast answer before sending again', async () => {
    const { render, sources } = timedRender(10);
    const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

    scheduler.update('a');
    await vi.advanceTimersByTimeAsync(10); // answered at t=10
    scheduler.update('ab');

    await vi.advanceTimersByTimeAsync(PREVIEW_MIN_INTERVAL_MS - 1);
    expect(sources).toEqual(['a']);

    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toEqual(['a', 'ab']);
  });

  it('waits as long as a slow render took before sending again', async () => {
    const { render, sources } = timedRender(1500);
    const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

    scheduler.update('a');
    await vi.advanceTimersByTimeAsync(1500); // answered after 1500 ms
    scheduler.update('ab');

    await vi.advanceTimersByTimeAsync(1499);
    expect(sources).toEqual(['a']);

    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toEqual(['a', 'ab']);
  });

  it('does not resend a source that is already on screen', async () => {
    const { render, sources } = timedRender(10);
    const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

    scheduler.update('same');
    await vi.advanceTimersByTimeAsync(10);
    scheduler.update('same');
    await vi.advanceTimersByTimeAsync(PREVIEW_MIN_INTERVAL_MS * 3);

    expect(sources).toEqual(['same']);
  });

  it('shows a blank preview when rendering fails and recovers on the next edit', async () => {
    const { render, calls } = manualRender();
    const onHtml = vi.fn();
    const scheduler = createPreviewScheduler({ render, onHtml });

    scheduler.update('a');
    calls[0]?.reject({ code: 'INTERNAL_ERROR', message: 'Failed to render preview' });
    await vi.advanceTimersByTimeAsync(0);
    expect(onHtml).toHaveBeenLastCalledWith('');

    scheduler.update('ab');
    await vi.advanceTimersByTimeAsync(PREVIEW_MIN_INTERVAL_MS);
    expect(calls[1]?.source).toBe('ab');
    calls[1]?.resolve('<p>ab</p>');
    await vi.advanceTimersByTimeAsync(0);
    expect(onHtml).toHaveBeenLastCalledWith('<p>ab</p>');
  });

  describe('dispose', () => {
    it('aborts the request in flight and drops its answer', async () => {
      const { render, calls } = manualRender();
      const onHtml = vi.fn();
      const scheduler = createPreviewScheduler({ render, onHtml });

      scheduler.update('a');
      scheduler.dispose();
      expect(calls[0]?.signal.aborted).toBe(true);

      calls[0]?.resolve('<p>late</p>');
      await vi.advanceTimersByTimeAsync(0);
      expect(onHtml).not.toHaveBeenCalled();
    });

    it('does not report the abort it caused as a failure', async () => {
      const { render, calls } = manualRender();
      const onHtml = vi.fn();
      const scheduler = createPreviewScheduler({ render, onHtml });

      scheduler.update('a');
      scheduler.dispose();
      calls[0]?.reject(new DOMException('aborted', 'AbortError'));
      await vi.advanceTimersByTimeAsync(0);

      expect(onHtml).not.toHaveBeenCalled();
    });

    it('cancels a send that was waiting for the interval to elapse', async () => {
      const { render, sources } = timedRender(10);
      const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

      scheduler.update('a');
      await vi.advanceTimersByTimeAsync(10);
      scheduler.update('ab'); // waits out the interval
      scheduler.dispose();
      await vi.advanceTimersByTimeAsync(PREVIEW_MIN_INTERVAL_MS * 3);

      expect(sources).toEqual(['a']);
    });

    it('ignores edits made afterwards', async () => {
      const { render } = manualRender();
      const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

      scheduler.dispose();
      scheduler.update('a');

      expect(render).not.toHaveBeenCalled();
    });
  });

  it('abandons a request that never answers so later edits still render', async () => {
    const { render, calls } = manualRender();
    const onHtml = vi.fn();
    const scheduler = createPreviewScheduler({ render, onHtml });

    scheduler.update('a');
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
    expect(calls[0]?.signal.aborted).toBe(true);

    // The caller's fetch rejects once aborted; that must not blank the pane.
    calls[0]?.reject(new DOMException('aborted', 'AbortError'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onHtml).not.toHaveBeenCalled();

    scheduler.update('ab');
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS); // gap scales with the 30 s wait
    expect(calls[1]?.source).toBe('ab');
  });

  // The failure this module exists to prevent: a request per keystroke
  // outruns a server that renders one page at a time, so the queue — and the
  // preview's lag — grows for as long as the user keeps typing.
  describe('while typing continuously against a slow server', () => {
    const KEYSTROKE_INTERVAL_MS = 100; // ~10 characters per second
    const RENDER_COST_MS = 300; // a ~75 KB page: capacity 3.3 requests per second
    const KEYSTROKES = 200; // 20 seconds of typing

    async function typeContinuously(scheduler: { update(source: string): void }) {
      for (let i = 1; i <= KEYSTROKES; i += 1) {
        scheduler.update('x'.repeat(i));
        await vi.advanceTimersByTimeAsync(KEYSTROKE_INTERVAL_MS);
      }
    }

    it('never queues more than one request on the server', async () => {
      const server = serialServer(RENDER_COST_MS);
      const scheduler = createPreviewScheduler({ render: server.render, onHtml: vi.fn() });

      await typeContinuously(scheduler);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(server.maxPending()).toBe(1);
    });

    it('keeps the preview refreshing while the user types', async () => {
      const server = serialServer(RENDER_COST_MS);
      const onHtml = vi.fn();
      const scheduler = createPreviewScheduler({ render: server.render, onHtml });

      await typeContinuously(scheduler);

      // 20 s of typing against ~0.7 s per cycle: a steady stream of updates,
      // not one frozen result and not one per keystroke.
      expect(onHtml.mock.calls.length).toBeGreaterThan(15);
      expect(onHtml.mock.calls.length).toBeLessThan(KEYSTROKES / 4);
    });

    it('shows the final text promptly once the user stops', async () => {
      const server = serialServer(RENDER_COST_MS);
      const onHtml = vi.fn();
      const scheduler = createPreviewScheduler({ render: server.render, onHtml });

      await typeContinuously(scheduler);
      // Worst case: a request has just gone out, so the final one waits for it,
      // then the gap, then its own render.
      await vi.advanceTimersByTimeAsync(RENDER_COST_MS + PREVIEW_MIN_INTERVAL_MS + RENDER_COST_MS);

      expect(onHtml).toHaveBeenLastCalledWith(`<p>${'x'.repeat(KEYSTROKES)}</p>`);
    });

    it('leaves the server idle at least half of the time', async () => {
      const server = serialServer(RENDER_COST_MS);
      const render = vi.fn(server.render);
      const scheduler = createPreviewScheduler({ render, onHtml: vi.fn() });

      await typeContinuously(scheduler);

      const busyMs = render.mock.calls.length * RENDER_COST_MS;
      const totalMs = KEYSTROKES * KEYSTROKE_INTERVAL_MS;
      expect(busyMs / totalMs).toBeLessThanOrEqual(0.5);
    });
  });
});
