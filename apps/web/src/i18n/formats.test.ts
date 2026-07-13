import { describe, expect, it } from 'vitest';
import { createAppFormatter } from './formatter';

describe('registered i18n formats', () => {
  it('formats dates and numbers through next-intl presets', () => {
    const date = new Date('2026-01-02T00:00:00.000Z');
    const english = createAppFormatter('en');
    const chinese = createAppFormatter('zh');

    expect(english.dateTime(date, 'short')).toContain('Jan');
    expect(chinese.dateTime(date, 'short')).not.toBe(english.dateTime(date, 'short'));
    expect(english.number(12345, 'integer')).toContain('12');
    expect(english.relativeTime(new Date(Date.now() - 60_000), { now: new Date() })).toMatch(/minute|second/);
  });
});
