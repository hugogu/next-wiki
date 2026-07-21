import { afterEach, describe, expect, it } from 'vitest';
import {
  REGISTERED_ANALYTICS_PROVIDERS,
  buildActiveScriptContent,
  type AnalyticsProviderDefinition,
} from '@/server/services/analytics';

/**
 * US4 - a new provider is registered by appending to
 * `REGISTERED_ANALYTICS_PROVIDERS` (the registry is a plain, non-frozen
 * array — no test-only registration hook is needed). This test appends a
 * throwaway "test_provider" entry, proves it flows through the same
 * `buildActiveScriptContent` code path as the built-ins with no
 * special-casing, then removes it so other tests are unaffected.
 */
describe('analytics provider registry pluggability', () => {
  const testProvider: AnalyticsProviderDefinition = {
    // Cast: the shared `AnalyticsProvider` enum only knows the two built-ins;
    // registering a third provider for real would also require appending to
    // that enum (see contracts/script-injection.md "Adding a New Provider").
    provider: 'test_provider' as AnalyticsProviderDefinition['provider'],
    label: 'Test Provider',
    description: 'A throwaway provider used to prove the registry is pluggable.',
    trackingIdFormatHint: 'any non-empty string',
    trackingIdPattern: /^.+$/,
    buildScriptContent: (trackingId) => `\n  window.__testProviderLoaded = "${trackingId}";`,
  };

  afterEach(() => {
    const index = REGISTERED_ANALYTICS_PROVIDERS.indexOf(testProvider);
    if (index !== -1) REGISTERED_ANALYTICS_PROVIDERS.splice(index, 1);
  });

  it('delivers a newly registered provider through the same buildActiveScriptContent path, alongside built-ins', () => {
    REGISTERED_ANALYTICS_PROVIDERS.push(testProvider);

    const content = buildActiveScriptContent([
      {
        provider: 'baidu_tongji',
        enabled: true,
        trackingId: 'abcdef0123456789abcdef0123456789',
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        provider: testProvider.provider,
        enabled: true,
        trackingId: 'my-test-id',
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    expect(content).toContain('hm.baidu.com');
    expect(content).toContain('window.__testProviderLoaded = "my-test-id";');
  });

  it('exports AnalyticsProviderDefinition and an iterable REGISTERED_ANALYTICS_PROVIDERS so a future contributor can append an entry', () => {
    expect(Array.isArray(REGISTERED_ANALYTICS_PROVIDERS)).toBe(true);
    expect(typeof REGISTERED_ANALYTICS_PROVIDERS[Symbol.iterator]).toBe('function');
    for (const definition of REGISTERED_ANALYTICS_PROVIDERS) {
      expect(typeof definition.provider).toBe('string');
      expect(typeof definition.buildScriptContent).toBe('function');
      expect(definition.trackingIdPattern).toBeInstanceOf(RegExp);
    }
  });
});
