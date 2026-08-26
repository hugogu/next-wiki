import { DomainError } from '@/server/errors';

export type PageContentEditMode = 'insertBefore' | 'insertAfter' | 'replace';

export type PageContentEdit = {
  /** Exact literal excerpt of the current source. `null` matches the very
   * end of the document (used by legacy `insertGeneratedImagesIntoMarkdown`
   * callers that append without a selection anchor); every other caller must
   * supply a real anchor. */
  anchor: string | null;
  mode: PageContentEditMode;
  text: string;
};

/**
 * An edit reduced to the span it actually occupies in the document.
 * `replace` occupies its full anchor span (that content is being removed, so
 * nothing else may touch it); `insertBefore`/`insertAfter` occupy only the
 * zero-width point where text is spliced in (`spliceStart === spliceEnd`),
 * since they never consume the anchor's own text — two insertions that both
 * reference the same anchor are not a conflict.
 */
type ResolvedEdit = {
  spliceStart: number;
  spliceEnd: number;
  text: string;
  order: number;
};

function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Resolve one anchor's exact position in `source`, or throw the same safe
 * errors `applyPageContentEdits` itself would throw. Exported so a caller
 * that needs an anchor's position for its own purposes (for example,
 * `insertGeneratedImagesIntoMarkdown` computing a separator from the
 * character that precedes it) shares this module's single anchor-resolution
 * implementation rather than duplicating it.
 */
export function resolveAnchorSpan(source: string, anchor: string): { start: number; end: number } {
  return resolveAnchor(source, anchor);
}

function resolveAnchor(source: string, anchor: string): { start: number; end: number } {
  const start = source.indexOf(anchor);
  if (start < 0) {
    throw new DomainError(
      'STALE_REVISION',
      `The passage "${truncate(anchor)}" is no longer present in this revision. Refresh and try again.`,
    );
  }
  if (source.indexOf(anchor, start + anchor.length) >= 0) {
    throw new DomainError(
      'BAD_REQUEST',
      `The passage "${truncate(anchor)}" occurs more than once. Select a more specific passage and try again.`,
    );
  }
  return { start, end: start + anchor.length };
}

function resolveEdit(source: string, edit: PageContentEdit, order: number): ResolvedEdit {
  const anchorSpan =
    edit.anchor === null
      ? { start: source.length, end: source.length }
      : resolveAnchor(source, edit.anchor);
  if (edit.mode === 'replace') {
    return { spliceStart: anchorSpan.start, spliceEnd: anchorSpan.end, text: edit.text, order };
  }
  const point = edit.mode === 'insertBefore' ? anchorSpan.start : anchorSpan.end;
  return { spliceStart: point, spliceEnd: point, text: edit.text, order };
}

/**
 * Splice one or more anchored edits into `source` in a single pass. Every
 * anchor is resolved against the *original* `source` before any edit is
 * applied, and applied only if every anchor resolves and no two edits occupy
 * overlapping spans — so a request either lands completely or not at all,
 * and no byte outside an edited span is ever touched (037
 * FR-003/FR-004/FR-005).
 */
export function applyPageContentEdits(source: string, edits: PageContentEdit[]): string {
  const resolved = edits.map((edit, order) => resolveEdit(source, edit, order));

  // Sorting by (start, then end) ascending guarantees that if any two edits
  // overlap, at least one adjacent pair in this order overlaps too — the
  // standard interval-overlap argument — so a single adjacent scan is enough
  // to catch any conflict without a running-max accumulator.
  const byPosition = [...resolved].sort(
    (a, b) => a.spliceStart - b.spliceStart || a.spliceEnd - b.spliceEnd,
  );
  for (let index = 1; index < byPosition.length; index += 1) {
    if (byPosition[index]!.spliceStart < byPosition[index - 1]!.spliceEnd) {
      throw new DomainError(
        'BAD_REQUEST',
        'Two or more edits target overlapping passages. Make each anchor refer to a distinct, non-overlapping part of the page.',
      );
    }
  }

  // Apply from the end of the document backward so positions resolved
  // against the original source stay valid as earlier edits are spliced in.
  // For edits that share a position (equal spliceStart), apply the
  // later-requested one first so the final document keeps the caller's
  // requested order.
  return resolved
    .slice()
    .sort((a, b) => b.spliceStart - a.spliceStart || b.order - a.order)
    .reduce(
      (result, edit) => `${result.slice(0, edit.spliceStart)}${edit.text}${result.slice(edit.spliceEnd)}`,
      source,
    );
}
