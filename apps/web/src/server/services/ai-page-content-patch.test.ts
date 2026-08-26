import { describe, expect, it } from 'vitest';
import { applyPageContentEdits } from './ai-page-content-patch';

describe('applyPageContentEdits — anchor-based splicing (037, US1)', () => {
  it('inserts new text immediately after a unique anchor', () => {
    const source = '# Title\n\nIntro paragraph.\n\nSecond paragraph.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Intro paragraph.', mode: 'insertAfter', text: '\n\nInserted paragraph.' },
    ]);
    expect(next).toBe(
      '# Title\n\nIntro paragraph.\n\nInserted paragraph.\n\nSecond paragraph.\n',
    );
  });

  it('inserts new text immediately before a unique anchor', () => {
    const source = '# Title\n\nSecond paragraph.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Second paragraph.', mode: 'insertBefore', text: 'Inserted paragraph.\n\n' },
    ]);
    expect(next).toBe('# Title\n\nInserted paragraph.\n\nSecond paragraph.\n');
  });

  it('replaces a unique anchor outright', () => {
    const source = 'The count is 12 as of 2023.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'is 12 as of 2023', mode: 'replace', text: 'is 47 as of 2026' },
    ]);
    expect(next).toBe('The count is 47 as of 2026.\n');
  });

  it('deletes a passage via replace with empty text', () => {
    const source = 'Keep this. Delete this part. Keep this too.\n';
    const next = applyPageContentEdits(source, [
      { anchor: ' Delete this part.', mode: 'replace', text: '' },
    ]);
    expect(next).toBe('Keep this. Keep this too.\n');
  });

  it('rejects an anchor that is not present in the source, before changing anything', () => {
    const source = 'Only this text exists.\n';
    expect(() =>
      applyPageContentEdits(source, [
        { anchor: 'This text was never here', mode: 'insertAfter', text: 'x' },
      ]),
    ).toThrow(/no longer present|not present/i);
  });

  it('rejects an anchor that occurs more than once instead of guessing which one', () => {
    const source = 'Repeat.\n\nRepeat.\n';
    expect(() =>
      applyPageContentEdits(source, [{ anchor: 'Repeat.', mode: 'insertAfter', text: ' more' }]),
    ).toThrow(/more than once/i);
  });

  it('handles an anchor at the very start of the document', () => {
    const source = 'First line.\nSecond line.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'First line.', mode: 'insertBefore', text: '# Heading\n\n' },
    ]);
    expect(next).toBe('# Heading\n\nFirst line.\nSecond line.\n');
  });

  it('handles an anchor at the very end of the document', () => {
    const source = 'First line.\nLast line.';
    const next = applyPageContentEdits(source, [
      { anchor: 'Last line.', mode: 'insertAfter', text: '\nAppended line.' },
    ]);
    expect(next).toBe('First line.\nLast line.\nAppended line.');
  });

  it('inserts after an anchor bordering a fenced code block without corrupting the fence', () => {
    const source = '```js\nconst x = 1;\n```\n\nExplanation.\n';
    const next = applyPageContentEdits(source, [
      { anchor: '```\n\nExplanation.', mode: 'insertBefore', text: 'Note before the fence closes.\n\n' },
    ]);
    expect(next).toBe(
      '```js\nconst x = 1;\nNote before the fence closes.\n\n```\n\nExplanation.\n',
    );
    // The fence markers themselves are untouched — three backticks survive intact.
    expect(next.match(/```/g)).toHaveLength(2);
  });

  it('replaces one table cell without disturbing the surrounding table structure', () => {
    const source = '| Name | Value |\n|------|-------|\n| Alpha | 1 |\n| Beta | 2 |\n';
    const next = applyPageContentEdits(source, [{ anchor: '| Alpha | 1 |', mode: 'replace', text: '| Alpha | 99 |' }]);
    expect(next).toBe('| Name | Value |\n|------|-------|\n| Alpha | 99 |\n| Beta | 2 |\n');
  });

  it('preserves every byte outside the edited span, including LaTex backslashes', () => {
    const source = 'Orbital inclination: $2.49^\\circ$.\n\nUnrelated passage to edit.\n\nMass: $5.683 \\times 10^{26}\\ \\text{kg}$.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Unrelated passage to edit.', mode: 'replace', text: 'Updated passage.' },
    ]);
    expect(next).toContain('$2.49^\\circ$');
    expect(next).toContain('$5.683 \\times 10^{26}\\ \\text{kg}$');
    expect(next).toBe(
      'Orbital inclination: $2.49^\\circ$.\n\nUpdated passage.\n\nMass: $5.683 \\times 10^{26}\\ \\text{kg}$.\n',
    );
  });
});

describe('applyPageContentEdits — multi-edit atomicity (037, US2)', () => {
  it('applies every edit in one pass when all anchors are valid', () => {
    const source = 'Alpha.\n\nBeta.\n\nGamma.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Alpha.', mode: 'replace', text: 'Alpha updated.' },
      { anchor: 'Gamma.', mode: 'replace', text: 'Gamma updated.' },
    ]);
    expect(next).toBe('Alpha updated.\n\nBeta.\n\nGamma updated.\n');
  });

  it('applies none of the edits when one anchor is missing', () => {
    const source = 'Alpha.\n\nBeta.\n';
    expect(() =>
      applyPageContentEdits(source, [
        { anchor: 'Alpha.', mode: 'replace', text: 'Alpha updated.' },
        { anchor: 'This text does not exist.', mode: 'replace', text: 'x' },
      ]),
    ).toThrow(/no longer present|not present/i);
  });

  it('applies none of the edits when one anchor is ambiguous', () => {
    const source = 'Repeat.\n\nRepeat.\n\nAlpha.\n';
    expect(() =>
      applyPageContentEdits(source, [
        { anchor: 'Alpha.', mode: 'replace', text: 'Alpha updated.' },
        { anchor: 'Repeat.', mode: 'insertAfter', text: ' more' },
      ]),
    ).toThrow(/more than once/i);
  });

  it('rejects the whole batch when two edits target overlapping passages', () => {
    const source = 'The quick brown fox jumps.\n';
    expect(() =>
      applyPageContentEdits(source, [
        { anchor: 'quick brown fox', mode: 'replace', text: 'slow red fox' },
        { anchor: 'brown fox jumps', mode: 'replace', text: 'x' },
      ]),
    ).toThrow(/overlap/i);
  });

  it('does not flag two zero-width inserts at the exact same anchor as overlapping', () => {
    const source = 'Alpha.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Alpha.', mode: 'insertAfter', text: ' First.' },
      { anchor: 'Alpha.', mode: 'insertAfter', text: ' Second.' },
    ]);
    // Requested order is preserved: "First." appears before "Second.".
    expect(next).toBe('Alpha. First. Second.\n');
  });

  it('produces a deterministic result for adjacent, non-overlapping edits', () => {
    const source = 'One. Two. Three.\n';
    const next = applyPageContentEdits(source, [
      { anchor: 'Three.', mode: 'replace', text: 'THREE.' },
      { anchor: 'One.', mode: 'replace', text: 'ONE.' },
      { anchor: 'Two.', mode: 'replace', text: 'TWO.' },
    ]);
    expect(next).toBe('ONE. TWO. THREE.\n');
  });
});
