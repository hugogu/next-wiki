import type { AiModelDetectorSource } from '@next-wiki/shared';
import { DomainError } from '@/server/errors';
import type { DetectorRuntimeConfig, ModelCapabilityDetector } from './types';
import { OpenRouterDetector } from './openrouter';
import { CloudflareDetector } from './cloudflare';

/**
 * Explicit detector registration. Detectors are never discovered by filesystem
 * convention or inferred from a provider vendor name — every source is listed
 * here, and an unknown source is rejected before any sync runs (Constitution
 * P10: explicit over implicit).
 */
const DETECTORS: Record<
  AiModelDetectorSource,
  {
    displayName: string;
    requiresProviderCredentials: boolean;
    supportsSchemaEnrichment: boolean;
    create: (config: DetectorRuntimeConfig) => ModelCapabilityDetector;
  }
> = {
  openrouter: {
    displayName: 'OpenRouter',
    requiresProviderCredentials: false,
    supportsSchemaEnrichment: false,
    create: (config) => new OpenRouterDetector(config),
  },
  cloudflare: {
    displayName: 'Cloudflare Workers AI',
    requiresProviderCredentials: true,
    supportsSchemaEnrichment: true,
    create: (config) => new CloudflareDetector(config),
  },
};

export const DETECTOR_SOURCES = Object.keys(DETECTORS) as AiModelDetectorSource[];

export function isDetectorSource(value: unknown): value is AiModelDetectorSource {
  return typeof value === 'string' && value in DETECTORS;
}

export function detectorMeta(source: AiModelDetectorSource) {
  const { displayName, requiresProviderCredentials, supportsSchemaEnrichment } = DETECTORS[source];
  return { source, displayName, requiresProviderCredentials, supportsSchemaEnrichment };
}

/** Instantiate the detector for a source, rejecting unknown sources. */
export function createDetector(config: DetectorRuntimeConfig): ModelCapabilityDetector {
  const entry = DETECTORS[config.source];
  if (!entry) {
    throw new DomainError('BAD_REQUEST', `Unknown model detector source: ${String(config.source)}`);
  }
  return entry.create(config);
}
