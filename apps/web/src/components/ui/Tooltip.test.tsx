// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tooltipPositionClassName } from './Tooltip';

describe('Tooltip positioning', () => {
  it('keeps the existing centered-above placement as the default geometry', () => {
    expect(tooltipPositionClassName('top', 'center')).toBe(
      'bottom-full mb-xs left-1/2 -translate-x-1/2',
    );
  });

  it('can open below and align its right edge inside a toolbar', () => {
    expect(tooltipPositionClassName('bottom', 'end')).toBe('top-full mt-xs right-0');
  });
});
