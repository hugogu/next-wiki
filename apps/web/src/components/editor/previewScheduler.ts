/**
 * Keeps the editor's live preview in step with the document without flooding
 * the server.
 *
 * The preview endpoint renders Markdown synchronously — roughly 4 ms per KB of
 * source — so a request per keystroke outruns it on any page of a few dozen KB:
 * the requests queue behind one another and the preview lags further behind the
 * longer you keep typing. This scheduler instead keeps at most one request in
 * flight, always sends the newest source, and waits at least as long as the
 * previous render took before sending again, so a single editor occupies the
 * server for no more than about half of the time.
 */

/** Shortest gap between two requests, however quickly the server answered. */
export const PREVIEW_MIN_INTERVAL_MS = 400;

/** A request still unanswered after this long is abandoned so the pane cannot freeze. */
export const PREVIEW_TIMEOUT_MS = 30_000;

export type PreviewRender = (source: string, signal: AbortSignal) => Promise<string>;

export type PreviewScheduler = {
  /** Reports the editor's current source; the preview catches up shortly after. */
  update(source: string): void;
  /** Cancels the request in flight and stops all further work. */
  dispose(): void;
};

export function createPreviewScheduler({
  render,
  onHtml,
  minIntervalMs = PREVIEW_MIN_INTERVAL_MS,
  timeoutMs = PREVIEW_TIMEOUT_MS,
}: {
  render: PreviewRender;
  onHtml: (html: string) => void;
  minIntervalMs?: number;
  timeoutMs?: number;
}): PreviewScheduler {
  // The newest source the editor reported, and the one most recently sent.
  let latest: string | undefined;
  let sent: string | undefined;
  let inFlight: AbortController | undefined;
  // Earliest moment the next request may go out; the first one is not delayed.
  let nextSendAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  // Sends the newest source if nothing is in flight and the gap has elapsed;
  // otherwise arranges to try again. Edits made while a request is in flight
  // collapse into `latest`, which `send`'s completion hands back here.
  function pump() {
    if (disposed || inFlight || latest === undefined || latest === sent) return;
    const wait = nextSendAt - performance.now();
    if (wait > 0) {
      timer ??= setTimeout(() => {
        timer = undefined;
        pump();
      }, wait);
      return;
    }
    send(latest);
  }

  function send(source: string) {
    sent = source;
    const request = new AbortController();
    inFlight = request;
    const startedAt = performance.now();
    const timeout = setTimeout(() => request.abort(), timeoutMs);
    render(source, request.signal)
      .then(
        (html) => {
          if (!request.signal.aborted) onHtml(html);
        },
        () => {
          // An aborted request is not a failure: it was cancelled on purpose.
          if (!request.signal.aborted) onHtml('');
        },
      )
      .finally(() => {
        clearTimeout(timeout);
        inFlight = undefined;
        const finishedAt = performance.now();
        nextSendAt = finishedAt + Math.max(minIntervalMs, finishedAt - startedAt);
        pump();
      });
  }

  return {
    update(source) {
      if (disposed) return;
      latest = source;
      pump();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      inFlight?.abort();
    },
  };
}
