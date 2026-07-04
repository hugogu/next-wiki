import { describe, it, expect } from 'vitest';
import { interpolateOffsetForLine, interpolateLineForOffset, type ScrollAnchor } from './scrollSync';

const anchors: ScrollAnchor[] = [
  { line: 1, offsetTop: 0 },
  { line: 5, offsetTop: 100 },
  { line: 10, offsetTop: 300 },
];

describe('interpolateOffsetForLine', () => {
  it('returns 0 for an empty table', () => {
    expect(interpolateOffsetForLine([], 5)).toBe(0);
  });

  it('clamps to the first anchor when the line is before the table', () => {
    expect(interpolateOffsetForLine(anchors, 0)).toBe(0);
  });

  it('clamps to the last anchor when the line is after the table', () => {
    expect(interpolateOffsetForLine(anchors, 999)).toBe(300);
  });

  it('returns an exact anchor offset for an exact line match', () => {
    expect(interpolateOffsetForLine(anchors, 5)).toBe(100);
  });

  it('interpolates linearly between two bracketing anchors', () => {
    // line 7.5 is halfway between anchor(5, 100) and anchor(10, 300)
    expect(interpolateOffsetForLine(anchors, 7.5)).toBeCloseTo(200);
  });

  it('handles a single-anchor table', () => {
    expect(interpolateOffsetForLine([{ line: 3, offsetTop: 42 }], 100)).toBe(42);
  });
});

describe('interpolateLineForOffset', () => {
  it('returns 1 for an empty table', () => {
    expect(interpolateLineForOffset([], 50)).toBe(1);
  });

  it('clamps to the first anchor when the offset is before the table', () => {
    expect(interpolateLineForOffset(anchors, -10)).toBe(1);
  });

  it('clamps to the last anchor when the offset is after the table', () => {
    expect(interpolateLineForOffset(anchors, 9999)).toBe(10);
  });

  it('returns an exact anchor line for an exact offset match', () => {
    expect(interpolateLineForOffset(anchors, 100)).toBe(5);
  });

  it('interpolates linearly between two bracketing anchors', () => {
    // offset 200 is halfway between anchor(5, 100) and anchor(10, 300)
    expect(interpolateLineForOffset(anchors, 200)).toBeCloseTo(7.5);
  });
});
