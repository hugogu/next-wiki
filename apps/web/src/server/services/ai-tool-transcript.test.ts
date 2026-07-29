import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_CHARS,
  MAX_TOOL_RESULT_CHARS,
  boundTranscript,
  effectiveToolResultChars,
  formatToolResultForModel,
} from './ai-tool-runtime';
import { TOOL_RESULT_MAX_CHARS_MIN } from '@next-wiki/shared';
import { pageContentWindowFor } from './ai-tool-executors';

/**
 * The transcript is re-sent in full on every planner iteration, so an unbounded
 * one grows as `calls × MAX_TOOL_RESULT_CHARS` — 3.2M characters at the default
 * 100-call budget. One observed turn made 51 calls and was sending roughly 350k
 * characters by the end.
 */
describe('boundTranscript', () => {
  const entry = (n: number, size = 8_000) => `TOOL get_page#${n} -> ${'x'.repeat(size)}`;

  it('leaves a transcript that fits alone', () => {
    const transcript = [entry(1, 100), entry(2, 100)];
    expect(boundTranscript(transcript, 10_000)).toEqual(transcript);
  });

  it('keeps the most recent entries and says how many it dropped', () => {
    const transcript = [entry(1), entry(2), entry(3), entry(4), entry(5)];

    const bounded = boundTranscript(transcript, 20_000);

    // Recency wins: the planner needs what it just did to decide the next step.
    expect(bounded.at(-1)).toBe(entry(5));
    expect(bounded).not.toContain(entry(1));
    expect(bounded[0]).toContain('earlier tool result(s) omitted');
    expect(bounded.join('').length).toBeLessThanOrEqual(20_000);
  });

  it('announces the drop in-band rather than silently shrinking', () => {
    const bounded = boundTranscript([entry(1), entry(2), entry(3)], 10_000);
    // A model that cannot tell "nothing more" from "no longer visible" will
    // confidently act on the gap — the same failure the result truncator avoids.
    expect(bounded[0]).toMatch(/Call the tool again/);
    expect(bounded[0]).toContain('2 earlier tool result(s) omitted');
  });

  it('budgets the omission notice with the retained results', () => {
    const bounded = boundTranscript([entry(1, 4_000), entry(2, 4_000), entry(3, 4_000)], 8_100);

    expect(bounded[0]).toContain('2 earlier tool result(s) omitted');
    expect(bounded.join('').length).toBeLessThanOrEqual(8_100);
  });

  it('still returns the newest entry when it alone exceeds the budget', () => {
    const bounded = boundTranscript([entry(1), entry(2)], 100);
    expect(bounded.at(-1)).toBe(entry(2));
  });

  it('bounds the worst case the call limit allows', () => {
    // 100 calls is the default maxToolCalls; every one may render a full result.
    const worstCase = Array.from({ length: 100 }, (_, index) => entry(index, MAX_TOOL_RESULT_CHARS));
    expect(worstCase.join('').length).toBeGreaterThan(800_000);

    const bounded = boundTranscript(worstCase);

    expect(bounded.join('').length).toBeLessThanOrEqual(
      DEFAULT_TRANSCRIPT_CHARS + MAX_TOOL_RESULT_CHARS + 200,
    );
  });

  it('handles an empty transcript', () => {
    expect(boundTranscript([], 10_000)).toEqual([]);
  });
});

/**
 * The per-result cap is an admin dial. It must not be settable into a state
 * where one result cannot fit the prompt the loop actually sends.
 */
describe('effectiveToolResultChars', () => {
  it('uses the configured cap when the transcript can hold it', () => {
    expect(effectiveToolResultChars(32_768, 48_000)).toBe(32_768);
  });

  it('clamps to the transcript budget on a small-context model', () => {
    // 32k-token model: budget is contextWindow/3, smaller than the dial.
    expect(effectiveToolResultChars(32_768, 10_922)).toBe(10_922);
  });

  it('never collapses below a usable floor', () => {
    expect(effectiveToolResultChars(2_000, 100)).toBe(1_000);
  });

  it('leaves the content window room for the fields wrapped around it', () => {
    const cap = effectiveToolResultChars(32_768, 48_000);
    const windowChars = pageContentWindowFor(cap);
    expect(windowChars).toBeLessThan(cap);

    // A full window plus a realistic envelope must still render untruncated.
    const rendered = formatToolResultForModel(
      'get_page',
      {
        summary: 'Read page "x".',
        data: {
          pageId: '0'.repeat(36),
          path: 'a/'.repeat(40),
          title: 'x'.repeat(200),
          revisionId: '0'.repeat(36),
          revisionHash: '0'.repeat(64),
          contentSource: 'y'.repeat(windowChars),
        },
      },
      cap,
    );
    expect(rendered.truncated).toBe(false);
  });

  it('keeps paging metadata intact at the lowest configurable cap', () => {
    const cap = TOOL_RESULT_MAX_CHARS_MIN;
    const rendered = formatToolResultForModel(
      'get_page',
      {
        summary: 'Read page "x" characters 0-1000 of 2000. Call get_page again with contentOffset=1000 for the rest before rewriting it.',
        data: {
          pageId: '0'.repeat(36),
          path: 'a/'.repeat(40),
          title: 'x'.repeat(200),
          locale: 'en',
          spaceSlug: 'wiki',
          revisionId: '0'.repeat(36),
          revisionHash: '0'.repeat(64),
          contentSource: 'y'.repeat(pageContentWindowFor(cap)),
          contentOffset: 0,
          contentLength: 2_000,
          hasMore: true,
          nextContentOffset: 1_000,
        },
      },
      cap,
    );

    expect(rendered.truncated).toBe(false);
  });
});
