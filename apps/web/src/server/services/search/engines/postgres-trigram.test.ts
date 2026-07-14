import { describe, expect, it } from 'vitest';
import { hasSelectiveTrigram } from './postgres-trigram';

describe('hasSelectiveTrigram', () => {
  it('does not send one- and two-character fragments to unselective content retrieval', () => {
    expect(hasSelectiveTrigram('测')).toBe(false);
    expect(hasSelectiveTrigram('测试')).toBe(false);
    expect(hasSelectiveTrigram('ab')).toBe(false);
  });

  it('allows three-character and longer fragments after whitespace normalization', () => {
    expect(hasSelectiveTrigram('支付对账')).toBe(true);
    expect(hasSelectiveTrigram('a b c')).toBe(true);
  });
});
