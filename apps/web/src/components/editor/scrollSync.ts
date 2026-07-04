/**
 * One point mapping a rendered preview element back to the source line it
 * came from. `offsetTop` is measured from the top of the preview's
 * scrollable content (see `buildAnchors`), not the viewport.
 */
export type ScrollAnchor = { line: number; offsetTop: number };

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
 * Given a sorted-by-line anchor table, find the offset that corresponds to a
 * (possibly fractional) source line, interpolating between the two
 * bracketing anchors. Clamps to the table's range instead of extrapolating
 * past it.
 */
export function interpolateOffsetForLine(anchors: ScrollAnchor[], line: number): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  if (line <= first.line) return first.offsetTop;
  const last = anchors[anchors.length - 1]!;
  if (line >= last.line) return last.offsetTop;

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]!.line <= line) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo]!;
  const b = anchors[hi]!;
  const span = b.line - a.line || 1;
  return a.offsetTop + ((line - a.line) / span) * (b.offsetTop - a.offsetTop);
}

/**
 * Inverse of `interpolateOffsetForLine`: given a scroll offset, find the
 * corresponding (possibly fractional) source line number (1-indexed, to
 * match both mdast/rehype positions and CodeMirror's `doc.lineAt().number`).
 */
export function interpolateLineForOffset(anchors: ScrollAnchor[], offset: number): number {
  if (anchors.length === 0) return 1;
  const first = anchors[0]!;
  if (offset <= first.offsetTop) return first.line;
  const last = anchors[anchors.length - 1]!;
  if (offset >= last.offsetTop) return last.line;

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]!.offsetTop <= offset) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo]!;
  const b = anchors[hi]!;
  const span = b.offsetTop - a.offsetTop || 1;
  return a.line + ((offset - a.offsetTop) / span) * (b.line - a.line);
}
