import { describe, expect, it } from 'vitest';
import {
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
