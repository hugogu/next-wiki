import type { RevisionDiffOptions } from '@/lib/path';

/** Query parameters to set (a string) or remove (null). */
export type SearchPatch = Record<string, string | null>;

export function selectionSearchPatch(selection: readonly number[]): SearchPatch {
  if (selection.length === 2) {
    return { compare: `${Math.min(...selection)}..${Math.max(...selection)}`, selected: null };
  }
  if (selection.length === 1) return { compare: null, selected: String(selection[0]) };
  return { compare: null, selected: null };
}

/** Defaults are left out of the URL, the way `parseRevisionDiffOptions` reads them back. */
export function optionsSearchPatch(options: RevisionDiffOptions): SearchPatch {
  return {
    view: options.view === 'source' ? null : options.view,
    context: options.context === 3 ? null : String(options.context),
    ignoreWhitespace: options.ignoreWhitespace ? '1' : null,
    sync: options.sync ? null : '0',
  };
}

export function patchedUrl(href: string, patch: SearchPatch): string {
  const url = new URL(href);
  for (const [key, value] of Object.entries(patch)) {
    url.searchParams.delete(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Keeps the address bar describing the History view without a navigation. A
 * `router.replace` would re-run the whole server page (app shell, history list
 * and both revisions) for what is only a change of selection or display option.
 * Next.js folds a native `replaceState` into its router, so the URL stays
 * shareable and a reload renders the same view.
 */
export function replaceHistorySearch(patch: SearchPatch): void {
  window.history.replaceState(null, '', patchedUrl(window.location.href, patch));
}
