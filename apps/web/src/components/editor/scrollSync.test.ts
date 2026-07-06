import { describe, it, expect } from 'vitest';
import { buildScrollMap, interpolatePaired, type ScrollPair } from './scrollSync';

const pairs: ScrollPair[] = [
  { editor: 0, preview: 0 },
  { editor: 100, preview: 200 },
  { editor: 300, preview: 400 },
];

describe('interpolatePaired', () => {
  it('returns 0 for an empty table', () => {
    expect(interpolatePaired([], 50, 'editor')).toBe(0);
  });

  it('clamps to the first pair when the value is before the table', () => {
    expect(interpolatePaired(pairs, -10, 'editor')).toBe(0);
    expect(interpolatePaired(pairs, -10, 'preview')).toBe(0);
  });

  it('clamps to the last pair when the value is after the table', () => {
    expect(interpolatePaired(pairs, 9999, 'editor')).toBe(400);
    expect(interpolatePaired(pairs, 9999, 'preview')).toBe(300);
  });

  it('returns the paired value for an exact match', () => {
    expect(interpolatePaired(pairs, 100, 'editor')).toBe(200);
    expect(interpolatePaired(pairs, 200, 'preview')).toBe(100);
  });

  it('interpolates linearly between two bracketing pairs', () => {
    // editor 200 is halfway between (100,200) and (300,400)
    expect(interpolatePaired(pairs, 200, 'editor')).toBeCloseTo(300);
    // preview 300 is halfway between (100,200) and (300,400)
    expect(interpolatePaired(pairs, 300, 'preview')).toBeCloseTo(200);
  });
});

describe('buildScrollMap', () => {
  it('always pins both extremes so the panes reach their bottoms together', () => {
    const map = buildScrollMap([{ editor: 50, preview: 120 }], 200, 500);
    expect(map[0]).toEqual({ editor: 0, preview: 0 });
    expect(map[map.length - 1]).toEqual({ editor: 200, preview: 500 });
  });

  it('keeps in-range interior anchors between the sentinels', () => {
    const map = buildScrollMap([{ editor: 50, preview: 120 }], 200, 500);
    expect(map).toContainEqual({ editor: 50, preview: 120 });
    expect(map).toHaveLength(3);
  });

  it('drops anchors outside the scrollable range', () => {
    const map = buildScrollMap(
      [
        { editor: -5, preview: 10 },
        { editor: 250, preview: 120 }, // editor past max
        { editor: 80, preview: 600 }, // preview past max
      ],
      200,
      500,
    );
    expect(map).toEqual([
      { editor: 0, preview: 0 },
      { editor: 200, preview: 500 },
    ]);
  });

  it('drops anchors that would break strict monotonicity', () => {
    const map = buildScrollMap(
      [
        { editor: 100, preview: 150 },
        { editor: 90, preview: 200 }, // editor goes backwards
        { editor: 120, preview: 140 }, // preview goes backwards
        { editor: 150, preview: 250 },
      ],
      300,
      400,
    );
    expect(map).toEqual([
      { editor: 0, preview: 0 },
      { editor: 100, preview: 150 },
      { editor: 150, preview: 250 },
      { editor: 300, preview: 400 },
    ]);
  });
});
