// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRevisionDiffOptions, parseRevisionDiffOptions } from '@/lib/path';
import {
  optionsSearchPatch,
  patchedUrl,
  replaceHistorySearch,
  selectionSearchPatch,
} from './history-url';

describe('selectionSearchPatch', () => {
  it('names a pair as an ordered comparison, whichever order it was picked in', () => {
    expect(selectionSearchPatch([3, 9])).toEqual({ compare: '3..9', selected: null });
    expect(selectionSearchPatch([9, 3])).toEqual({ compare: '3..9', selected: null });
  });

  it('names a single version as the selected one', () => {
    expect(selectionSearchPatch([5])).toEqual({ compare: null, selected: '5' });
  });

  it('names nothing for an empty selection', () => {
    expect(selectionSearchPatch([])).toEqual({ compare: null, selected: null });
  });
});

describe('optionsSearchPatch', () => {
  it('leaves defaults out of the URL', () => {
    expect(optionsSearchPatch(defaultRevisionDiffOptions)).toEqual({
      view: null,
      context: null,
      ignoreWhitespace: null,
      sync: null,
    });
  });

  it('writes what differs from the defaults', () => {
    expect(
      optionsSearchPatch({ view: 'preview', context: 'full', ignoreWhitespace: true, sync: false }),
    ).toEqual({ view: 'preview', context: 'full', ignoreWhitespace: '1', sync: '0' });
    expect(optionsSearchPatch({ ...defaultRevisionDiffOptions, context: 0 }).context).toBe('0');
  });

  it('round-trips through the parser the server page uses', () => {
    const options = { view: 'preview', context: 5, ignoreWhitespace: true, sync: false } as const;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(optionsSearchPatch(options))) {
      if (value !== null) params.set(key, value);
    }

    expect(parseRevisionDiffOptions(params)).toEqual(options);
  });
});

describe('patchedUrl', () => {
  it('sets, replaces and removes parameters while keeping the others', () => {
    expect(
      patchedUrl('http://localhost/h/docs/a?space=generated&compare=1..2&view=preview', {
        compare: null,
        selected: '4',
      }),
    ).toBe('/h/docs/a?space=generated&view=preview&selected=4');
  });

  it('yields a bare path when nothing is left', () => {
    expect(patchedUrl('http://localhost/h/docs/a?compare=1..2', { compare: null, selected: null })).toBe('/h/docs/a');
  });

  it('keeps a version range readable', () => {
    expect(patchedUrl('http://localhost/h/docs/a', { compare: '3..9' })).toBe('/h/docs/a?compare=3..9');
  });
});

describe('replaceHistorySearch', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('rewrites the address in place without adding a history entry or reloading', () => {
    window.history.replaceState(null, '', '/h/docs/a?compare=1..2');
    const entries = window.history.length;
    const replace = vi.spyOn(window.history, 'replaceState');

    replaceHistorySearch({ compare: null, selected: '2' });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe('/h/docs/a?selected=2');
    expect(window.history.length).toBe(entries);
  });
});
