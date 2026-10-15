import type { HistoryRevision } from './history-revision';

export type HistoryViewState = {
  /** What the version list shows as picked. It changes the moment a version is clicked. */
  selection: number[];
  /** What the content pane shows. It follows `selection` once every picked revision has loaded. */
  displayed: number[];
  /** Shown again when the last picked version is clicked off, as the bare History URL does. */
  fallback: number[];
  revisions: Record<number, HistoryRevision>;
  failed: Record<number, true>;
};

export type HistoryViewAction =
  | { type: 'toggle'; version: number }
  | { type: 'loading'; version: number }
  | { type: 'loaded'; revision: HistoryRevision }
  | { type: 'failed'; version: number };

export function sameSelection(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((version, index) => version === b[index]);
}

/** Clicking a picked version drops it, a third pick starts over, anything else adds. */
export function toggleSelection(
  selection: readonly number[],
  version: number,
  fallback: readonly number[] = [],
): number[] {
  if (selection.includes(version)) {
    const rest = selection.filter((picked) => picked !== version);
    return rest.length > 0 ? rest : [...fallback];
  }
  if (selection.length === 2) return [version];
  return [...selection, version].sort((a, b) => a - b);
}

export function createHistoryViewState({
  selection,
  fallback,
  revisions,
}: {
  selection: number[];
  fallback: number[];
  revisions: HistoryRevision[];
}): HistoryViewState {
  return {
    selection,
    displayed: selection,
    fallback,
    revisions: Object.fromEntries(revisions.map((revision) => [revision.version, revision])),
    failed: {},
  };
}

function allLoaded(revisions: HistoryViewState['revisions'], versions: readonly number[]): boolean {
  return versions.every((version) => revisions[version] !== undefined);
}

function withoutFailure(failed: HistoryViewState['failed'], version: number): HistoryViewState['failed'] {
  if (!failed[version]) return failed;
  const rest = { ...failed };
  delete rest[version];
  return rest;
}

export function historyViewReducer(state: HistoryViewState, action: HistoryViewAction): HistoryViewState {
  switch (action.type) {
    case 'toggle': {
      const selection = toggleSelection(state.selection, action.version, state.fallback);
      return {
        ...state,
        selection,
        displayed: allLoaded(state.revisions, selection) ? selection : state.displayed,
        // Picking a version whose last load failed is a retry: no error flash first.
        failed: withoutFailure(state.failed, action.version),
      };
    }
    case 'loading': {
      const failed = withoutFailure(state.failed, action.version);
      return failed === state.failed ? state : { ...state, failed };
    }
    case 'loaded': {
      const revisions = { ...state.revisions, [action.revision.version]: action.revision };
      return {
        ...state,
        revisions,
        failed: withoutFailure(state.failed, action.revision.version),
        displayed: allLoaded(revisions, state.selection) ? state.selection : state.displayed,
      };
    }
    case 'failed':
      return { ...state, failed: { ...state.failed, [action.version]: true } };
  }
}
