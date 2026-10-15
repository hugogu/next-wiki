import { describe, expect, it } from 'vitest';
import type { HistoryRevision } from './history-revision';
import {
  createHistoryViewState,
  historyViewReducer,
  sameSelection,
  toggleSelection,
  type HistoryViewState,
} from './history-view-state';

function revision(version: number): HistoryRevision {
  return { version, contentSource: `source ${version}`, contentHtml: `<p>${version}</p>`, previewLineOffset: 0 };
}

function stateWith(loaded: number[], selection: number[], fallback: number[] = []): HistoryViewState {
  return createHistoryViewState({ selection, fallback, revisions: loaded.map(revision) });
}

describe('toggleSelection', () => {
  it('adds a version, keeping the pair ordered', () => {
    expect(toggleSelection([], 4)).toEqual([4]);
    expect(toggleSelection([5], 3)).toEqual([3, 5]);
  });

  it('drops a version that is picked again', () => {
    expect(toggleSelection([3, 5], 3)).toEqual([5]);
  });

  it('starts over with the clicked version once two are picked', () => {
    expect(toggleSelection([3, 5], 4)).toEqual([4]);
  });

  it('falls back to the default comparison when the last pick is dropped', () => {
    expect(toggleSelection([4], 4, [8, 9])).toEqual([8, 9]);
    expect(toggleSelection([4], 4)).toEqual([]);
  });

  it('does not alias the fallback it hands back', () => {
    const fallback = [8, 9];
    expect(toggleSelection([4], 4, fallback)).not.toBe(fallback);
  });
});

describe('sameSelection', () => {
  it('compares versions in order', () => {
    expect(sameSelection([1, 2], [1, 2])).toBe(true);
    expect(sameSelection([1, 2], [2, 1])).toBe(false);
    expect(sameSelection([1], [1, 2])).toBe(false);
  });
});

describe('historyViewReducer', () => {
  it('shows what the first render was given', () => {
    const state = stateWith([2, 3], [2, 3]);

    expect(state.selection).toEqual([2, 3]);
    expect(state.displayed).toEqual([2, 3]);
  });

  it('moves the selection and the content at once when the picked revisions are already loaded', () => {
    const state = historyViewReducer(stateWith([2, 3, 4], [2, 3]), { type: 'toggle', version: 4 });

    expect(state.selection).toEqual([4]);
    expect(state.displayed).toEqual([4]);
  });

  it('moves the selection at once but keeps the old content until the new revision arrives', () => {
    const picked = historyViewReducer(stateWith([2, 3], [2, 3]), { type: 'toggle', version: 9 });

    expect(picked.selection).toEqual([9]);
    expect(picked.displayed).toEqual([2, 3]);

    const loaded = historyViewReducer(picked, { type: 'loaded', revision: revision(9) });
    expect(loaded.displayed).toEqual([9]);
    expect(loaded.revisions[9]).toEqual(revision(9));
  });

  it('waits for both revisions of a pair before switching content', () => {
    let state = stateWith([2], [2]);
    state = historyViewReducer(state, { type: 'toggle', version: 8 });
    expect(state.selection).toEqual([2, 8]);
    expect(state.displayed).toEqual([2]);

    state = historyViewReducer(state, { type: 'loaded', revision: revision(8) });
    expect(state.displayed).toEqual([2, 8]);
  });

  it('only caches a revision that is no longer picked when it arrives late', () => {
    let state = stateWith([2, 3], [2, 3], [2, 3]);
    state = historyViewReducer(state, { type: 'toggle', version: 9 });
    state = historyViewReducer(state, { type: 'toggle', version: 9 });
    expect(state.selection).toEqual([2, 3]);

    state = historyViewReducer(state, { type: 'loaded', revision: revision(9) });

    expect(state.revisions[9]).toEqual(revision(9));
    expect(state.selection).toEqual([2, 3]);
    expect(state.displayed).toEqual([2, 3]);
  });

  it('returns to the default comparison when the last pick is clicked off', () => {
    const state = historyViewReducer(stateWith([8, 9, 4], [4], [8, 9]), { type: 'toggle', version: 4 });

    expect(state.selection).toEqual([8, 9]);
    expect(state.displayed).toEqual([8, 9]);
  });

  it('records a failed load and clears it when the revision loads on a retry', () => {
    let state = historyViewReducer(stateWith([2], [2]), { type: 'toggle', version: 9 });
    state = historyViewReducer(state, { type: 'failed', version: 9 });
    expect(state.failed[9]).toBe(true);
    expect(state.displayed).toEqual([2]);

    state = historyViewReducer(state, { type: 'loading', version: 9 });
    expect(state.failed[9]).toBeUndefined();

    state = historyViewReducer(state, { type: 'failed', version: 9 });
    state = historyViewReducer(state, { type: 'loaded', revision: revision(9) });
    expect(state.failed[9]).toBeUndefined();
    expect(state.displayed).toEqual([2, 9]);
  });

  it('treats picking a version whose earlier load failed as a retry, with no error flash', () => {
    let state = historyViewReducer(stateWith([2], [2]), { type: 'failed', version: 9 }); // a hover that failed
    expect(state.failed[9]).toBe(true);

    state = historyViewReducer(state, { type: 'toggle', version: 9 });

    expect(state.selection).toEqual([2, 9]);
    expect(state.failed[9]).toBeUndefined();
  });

  it('keeps the same state object when a retry has nothing to clear', () => {
    const state = stateWith([2], [2]);

    expect(historyViewReducer(state, { type: 'loading', version: 5 })).toBe(state);
  });
});
