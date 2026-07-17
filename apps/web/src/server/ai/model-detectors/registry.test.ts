import { describe, expect, it } from 'vitest';
import { createDetector, detectorMeta, isDetectorSource, DETECTOR_SOURCES } from './registry';
import { CloudflareDetector } from './cloudflare';
import { OpenRouterDetector } from './openrouter';
import { detectorRuntime } from './test-helpers';

describe('detector registry', () => {
  it('registers exactly the known sources', () => {
    expect([...DETECTOR_SOURCES].sort()).toEqual(['cloudflare', 'openrouter']);
  });

  it('creates the right implementation for each source', () => {
    expect(createDetector(detectorRuntime({ source: 'cloudflare' }))).toBeInstanceOf(CloudflareDetector);
    expect(createDetector(detectorRuntime({ source: 'openrouter' }))).toBeInstanceOf(OpenRouterDetector);
  });

  it('rejects an unknown source before sync starts', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createDetector(detectorRuntime({ source: 'made-up' as any }))).toThrow(/Unknown model detector/);
  });

  it('reports whether a value is a registered source', () => {
    expect(isDetectorSource('cloudflare')).toBe(true);
    expect(isDetectorSource('nope')).toBe(false);
    expect(isDetectorSource(42)).toBe(false);
  });

  it('exposes detector metadata for admin display', () => {
    expect(detectorMeta('cloudflare')).toMatchObject({
      source: 'cloudflare',
      requiresProviderCredentials: true,
      supportsSchemaEnrichment: true,
    });
    expect(detectorMeta('openrouter')).toMatchObject({
      source: 'openrouter',
      requiresProviderCredentials: false,
    });
  });
});
