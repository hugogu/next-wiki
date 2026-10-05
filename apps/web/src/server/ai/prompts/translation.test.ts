import { describe, expect, it } from 'vitest';
import {
  computeMaxOutputTokens,
  estimateTokens,
  isImplausiblyShortTranslation,
  normalizeGeneratedMarkdown,
  reachedOutputLimit,
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

  it('leaves room for a whole Chinese page, which is about a token per character', () => {
    // Regression: a 12,963-character Chinese page was budgeted as length / 4
    // tokens, so the cap came out at exactly 7,506. The model used all of it and
    // was cut off, in the middle of its reasoning, before it wrote anything.
    const page = '中'.repeat(10_500) + 'a'.repeat(2_463);
    const maxOut = computeMaxOutputTokens(page, 1_310_720, 131_072);
    expect(maxOut).not.toBe(7506);
    expect(maxOut).toBeGreaterThan(page.length);
  });

  it('budgets a Latin page exactly as before', () => {
    // 8,000 characters is ~2,000 tokens: twice that, plus the floor.
    expect(computeMaxOutputTokens('y'.repeat(8000), 128_000, 16_384)).toBe(5024);
  });

  it('gives a model that reasons room for the answer and for its thinking', () => {
    const page = '中'.repeat(3000);
    const plain = computeMaxOutputTokens(page, null, 131_072);
    const thinking = computeMaxOutputTokens(page, null, 131_072, { reasons: true });
    expect(thinking).toBe(plain * 2);
  });

  it('still honours the model limit and the context window when it reasons', () => {
    const page = '中'.repeat(50_000);
    expect(computeMaxOutputTokens(page, null, 16_384, { reasons: true })).toBe(16_384);
    const window = 100_000;
    const maxOut = computeMaxOutputTokens(page, window, 131_072, { reasons: true });
    expect(estimateTokens(page) + 800 + maxOut).toBeLessThanOrEqual(window);
  });
});

describe('estimateTokens', () => {
  it('counts Latin text at about four characters per token', () => {
    expect(estimateTokens('x'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });

  it('counts Chinese, Japanese and Korean at about a token per character', () => {
    expect(estimateTokens('中'.repeat(100))).toBe(100);
    expect(estimateTokens('こんにちは')).toBe(5);
    expect(estimateTokens('한국어')).toBe(3);
  });

  it('weighs each script in a mixed page separately', () => {
    expect(estimateTokens('中'.repeat(10) + 'abcd'.repeat(5))).toBe(10 + 5);
  });
});

describe('reachedOutputLimit', () => {
  it('recognizes the finish reasons that mean the response was cut off', () => {
    expect(reachedOutputLimit('length')).toBe(true);
    expect(reachedOutputLimit('max_tokens')).toBe(true);
  });

  it('does not mistake a finished or unreported response for one', () => {
    for (const reason of ['stop', 'end_turn', 'content_filter', 'tool_calls', null, undefined]) {
      expect(reachedOutputLimit(reason)).toBe(false);
    }
  });
});
