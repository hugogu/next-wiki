import { resolveToolCallStrategy, type ToolStrategyInput } from './ai-tool-strategy';

/**
 * Every branch of the strategy resolution table (028, research R4).
 *
 * The property that matters across all of them: resolution always yields a
 * usable strategy. There is no input for which a turn cannot proceed, because
 * the text protocol is the floor.
 */

const base: ToolStrategyInput = {
  strategy: 'auto',
  nativeFailedAt: null,
  adapterSupportsNativeTools: true,
};

describe('resolveToolCallStrategy', () => {
  it('prefers native under auto when the adapter supports it and nothing has failed', () => {
    expect(resolveToolCallStrategy(base)).toEqual({ strategy: 'native', reason: 'auto_native' });
  });

  it('falls back to text under auto when the adapter has no native tools', () => {
    expect(resolveToolCallStrategy({ ...base, adapterSupportsNativeTools: false })).toEqual({
      strategy: 'text',
      reason: 'adapter_unsupported',
    });
  });

  it('falls back to text under auto after a recorded native failure', () => {
    expect(resolveToolCallStrategy({ ...base, nativeFailedAt: new Date() })).toEqual({
      strategy: 'text',
      reason: 'previous_native_failure',
    });
  });

  it('honours an explicit text override even when native would work', () => {
    expect(resolveToolCallStrategy({ ...base, strategy: 'text' })).toEqual({
      strategy: 'text',
      reason: 'admin_override_text',
    });
  });

  it('honours an explicit native override, ignoring a stale failure marker', () => {
    // Setting the strategy clears the marker in the DB; this covers the case
    // where a caller passes a stale one anyway.
    expect(
      resolveToolCallStrategy({ ...base, strategy: 'native', nativeFailedAt: new Date() }),
    ).toEqual({ strategy: 'native', reason: 'admin_override_native' });
  });

  it('cannot invent native support the adapter does not have', () => {
    expect(
      resolveToolCallStrategy({
        ...base,
        strategy: 'native',
        adapterSupportsNativeTools: false,
      }),
    ).toEqual({ strategy: 'text', reason: 'adapter_unsupported' });
  });

  it('always resolves to a usable strategy', () => {
    const strategies = ['auto', 'native', 'text'] as const;
    for (const strategy of strategies) {
      for (const nativeFailedAt of [null, new Date()]) {
        for (const adapterSupportsNativeTools of [true, false]) {
          const resolved = resolveToolCallStrategy({
            strategy,
            nativeFailedAt,
            adapterSupportsNativeTools,
          });
          expect(['native', 'text']).toContain(resolved.strategy);
          if (!adapterSupportsNativeTools) expect(resolved.strategy).toBe('text');
        }
      }
    }
  });
});
