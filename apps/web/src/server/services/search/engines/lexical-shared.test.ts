import { describe, expect, it } from 'vitest';
import { EngineDeadlineExceeded } from '../deadline';
import { collectCompletedLexicalWindows } from './lexical-shared';

describe('collectCompletedLexicalWindows', () => {
  it('keeps completed title candidates when a content window times out', async () => {
    await expect(collectCompletedLexicalWindows([
      Promise.resolve(['title-hit']),
      Promise.reject(new EngineDeadlineExceeded()),
    ])).resolves.toEqual([['title-hit']]);
  });

  it('reports a timeout only when every window exceeds its database budget', async () => {
    await expect(collectCompletedLexicalWindows([
      Promise.reject(new EngineDeadlineExceeded()),
      Promise.reject(new EngineDeadlineExceeded()),
    ])).rejects.toBeInstanceOf(EngineDeadlineExceeded);
  });

  it('preserves a non-timeout failure when no window completes', async () => {
    const failure = new Error('database unavailable');
    await expect(collectCompletedLexicalWindows([Promise.reject(failure)])).rejects.toBe(failure);
  });
});
