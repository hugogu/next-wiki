/**
 * One point mapping a rendered preview element back to the source line it
 * came from. `offsetTop` is measured from the top of the preview's
 * scrollable content (see `buildAnchors`), not the viewport.
 */
export type ScrollAnchor = { line: number; offsetTop: number };

/**
 * A single point in a bidirectional scroll map: the editor and preview scroll
 * offsets (both measured from the top of their own scrollable content) that
 * should line up on screen.
 */
export type ScrollPair = { editor: number; preview: number };

/**
 * Scan a rendered preview subtree for `[data-line]` elements (stamped by the
 * `addLineAnchors` rehype plugin — see server/pipeline/index.ts) and build a
 * sorted, deduplicated anchor table.
 *
 * `root` must be the scrollable element itself: offsets are computed
 * relative to its content box plus its current `scrollTop`, so the result is
 * stable across the element's own scroll position at build time.
 */
export function buildAnchors(root: HTMLElement): ScrollAnchor[] {
  const rootRect = root.getBoundingClientRect();
  const elements = root.querySelectorAll<HTMLElement>('[data-line]');
  const anchors: ScrollAnchor[] = [];
  let lastLine = Number.NaN;
  for (const el of elements) {
    const line = Number(el.dataset.line);
    if (!Number.isFinite(line) || line === lastLine) continue;
    const rect = el.getBoundingClientRect();
    anchors.push({ line, offsetTop: rect.top - rootRect.top + root.scrollTop });
    lastLine = line;
  }
  return anchors;
}

/**
 * Turn raw per-anchor (editorOffset, previewOffset) points into a monotonic
 * scroll map that also pins the two extremes: `(0, 0)` at the very top and
 * `(editorMax, previewMax)` at the very bottom. Pinning the ends is what makes
 * "scroll one pane to its bottom" land the other at *its* bottom too, even
 * though the panes have naturally different total heights — the interior
 * anchors keep the mapping content-aligned in between.
 *
 * Interior points that are out of range or would break strict monotonicity
 * (rare, e.g. a preview element whose measured order disagrees with source
 * order) are dropped so the piecewise-linear interpolation stays invertible.
 */
export function buildScrollMap(
  rawPairs: ScrollPair[],
  editorMax: number,
  previewMax: number,
): ScrollPair[] {
  const pairs: ScrollPair[] = [{ editor: 0, preview: 0 }];
  for (const p of rawPairs) {
    if (p.editor <= 0 || p.preview <= 0 || p.editor >= editorMax || p.preview >= previewMax) {
      continue;
    }
    const prev = pairs[pairs.length - 1]!;
    if (p.editor <= prev.editor || p.preview <= prev.preview) continue;
    pairs.push(p);
  }
  const prev = pairs[pairs.length - 1]!;
  if (editorMax > prev.editor && previewMax > prev.preview) {
    pairs.push({ editor: editorMax, preview: previewMax });
  }
  return pairs;
}

/**
 * Interpolate one axis of a scroll map from a value on the other axis. `from`
 * selects the known axis; the other is returned. The table must be sorted and
 * strictly increasing on both axes (see `buildScrollMap`). Clamps to the
 * table's range instead of extrapolating past it.
 */
export function interpolatePaired(
  pairs: ScrollPair[],
  value: number,
  from: 'editor' | 'preview',
): number {
  const to = from === 'editor' ? 'preview' : 'editor';
  if (pairs.length === 0) return 0;
  const first = pairs[0]!;
  if (value <= first[from]) return first[to];
  const last = pairs[pairs.length - 1]!;
  if (value >= last[from]) return last[to];

  let lo = 0;
  let hi = pairs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid]![from] <= value) lo = mid;
    else hi = mid;
  }
  const a = pairs[lo]!;
  const b = pairs[hi]!;
  const span = b[from] - a[from] || 1;
  return a[to] + ((value - a[from]) / span) * (b[to] - a[to]);
}
