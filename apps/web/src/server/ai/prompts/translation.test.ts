import { describe, expect, it } from 'vitest';
import {
  computeMaxOutputTokens,
  isImplausiblyShortTranslation,
  normalizeGeneratedMarkdown,
} from './translation';

describe('normalizeGeneratedMarkdown', () => {
  it('strips a leading safety/moderation preamble line', () => {
    expect(normalizeGeneratedMarkdown('User Safety: safe\n\n# 标题\n\n正文')).toBe('# 标题\n\n正文');
    expect(normalizeGeneratedMarkdown('Moderation: allowed\n内容')).toBe('内容');
  });

  it('returns null when only a safety label was emitted', () => {
    // The exact failure observed in production with a routed free model.
    expect(normalizeGeneratedMarkdown('User Safety: safe')).toBeNull();
  });

  it('unwraps a whole-document code fence but keeps inner fences', () => {
    expect(normalizeGeneratedMarkdown('```markdown\n# T\n\n```js\ncode\n```\n```')).toBe(
      '# T\n\n```js\ncode\n```',
    );
  });

  it('keeps ordinary translated content untouched', () => {
    expect(normalizeGeneratedMarkdown('# Title\n\nBody')).toBe('# Title\n\nBody');
  });
});

describe('isImplausiblyShortTranslation', () => {
  const longSource = 'A'.repeat(400);

  it('rejects a tiny output for a substantial source', () => {
    expect(isImplausiblyShortTranslation(longSource, 'User Safety: safe')).toBe(true);
    expect(isImplausiblyShortTranslation(longSource, 'safe')).toBe(true);
  });

  it('accepts a normal-length translation', () => {
    expect(isImplausiblyShortTranslation(longSource, 'B'.repeat(300))).toBe(false);
  });

  it('never rejects when the source itself is short', () => {
    expect(isImplausiblyShortTranslation('# Hi', 'x')).toBe(false);
  });
});

describe('computeMaxOutputTokens', () => {
  it('never lets input + output exceed a window equal to the catalog max output', () => {
    // Regression: Tencent Hy3 reports maxOutputTokens == contextWindow (262144).
    // A small page must not request the whole window as output.
    const source = 'x'.repeat(1000); // ~250 source tokens
    const maxOut = computeMaxOutputTokens(source, 262144, 262144);
    const estInput = Math.ceil(source.length / 4) + 800;
    expect(maxOut).toBeLessThan(262144);
    expect(estInput + maxOut).toBeLessThanOrEqual(262144);
  });

  it('scales output with source size but keeps a floor', () => {
    expect(computeMaxOutputTokens('short', 8192, 4096)).toBeGreaterThanOrEqual(256);
    const big = computeMaxOutputTokens('y'.repeat(8000), 128000, 16384);
    expect(big).toBeGreaterThan(256);
    expect(big).toBeLessThanOrEqual(16384);
  });

  it('falls back to a sane default when the model reports no limits', () => {
    expect(computeMaxOutputTokens('y'.repeat(20000), null, null)).toBeLessThanOrEqual(8192);
  });
});
