import { applyExactSelection } from './AiTextOptimizationDialog';

describe('AI editor exact-range application', () => {
  const snapshot = { text: 'selected', from: 7, to: 15, hash: 'hash-value-123456' };

  it('replaces only the original range', () => {
    expect(applyExactSelection('before selected after', snapshot, 'improved')).toBe(
      'before improved after',
    );
  });

  it('refuses stale selections', () => {
    expect(applyExactSelection('before changed after', snapshot, 'improved')).toBeNull();
  });
});
