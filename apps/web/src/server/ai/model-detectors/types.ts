import type { AiCapability, AiModelDetectorSource, AiProviderType } from '@next-wiki/shared';
import { sanitizeProviderMessage } from '@/server/ai/types';

/**
 * Server-only Model Capability Detector contract. A detector lists and enriches
 * provider model metadata and returns normalized results. It never writes
 * database rows, evaluates purpose assignments, or serializes its credentials —
 * the AI admin service owns merge, override precedence, and action metadata.
 */
export interface ModelCapabilityDetector {
  readonly source: AiModelDetectorSource;
  listModels(input: DetectorListInput): Promise<DetectorListResult>;
}

export type DetectorRuntimeConfig = {
  source: AiModelDetectorSource;
  providerId: string;
  providerName: string;
  providerType: AiProviderType;
  vendor: string;
  accountId?: string;
  namespace?: string;
  options: {
    includeDeprecated?: boolean;
    hideExperimental?: boolean;
    forceRefresh?: boolean;
  };
  // Credentials live only in server memory for the current operation and must
  // never be serialized into logs, errors, action metadata, or UI responses.
  credentials: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
};

export type DetectorListInput = {
  abortSignal: AbortSignal;
};

export type DetectorEvidence = 'catalog' | 'schema' | 'catalog_and_schema';

export type DetectedCapability = {
  capability: AiCapability;
  supported: boolean;
  source: 'provider' | 'catalog';
  details: {
    detector: AiModelDetectorSource;
    evidence: DetectorEvidence;
    partial?: boolean;
    reason?: string;
  };
};

export type DetectedModel = {
  externalId: string;
  canonicalId?: string;
  displayName: string;
  availability: 'available' | 'unavailable' | 'unknown';
  contextWindow?: number;
  maxOutputTokens?: number;
  embeddingDimensions?: number;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: DetectedCapability[];
  rawMetadata: Record<string, unknown>;
  partial?: boolean;
};

export type DetectorWarning = {
  modelExternalId?: string;
  code: string;
};

export type DetectorCounts = {
  added?: number;
  updated?: number;
  unavailable?: number;
  skipped?: number;
  partial?: number;
};

export type DetectorListResult = {
  models: DetectedModel[];
  freshness: 'fresh' | 'cache';
  counts: DetectorCounts;
  warnings: DetectorWarning[];
};

export type DetectorErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CAPABILITY_UNSUPPORTED'
  | 'CANCELLED';

/**
 * A detector failure whose message and detail are always safe for administrator
 * display: the message is sanitized (bearer tokens, api keys, and account ids
 * redacted) and truncated, and `detail` is bounded, non-secret diagnostic JSON.
 */
export class DetectorError extends Error {
  readonly code: DetectorErrorCode;
  readonly retryable: boolean;
  readonly detail?: Record<string, unknown>;

  constructor(
    code: DetectorErrorCode,
    message: string,
    options: { retryable?: boolean; detail?: Record<string, unknown> } = {},
  ) {
    super(sanitizeProviderMessage(message));
    this.name = 'DetectorError';
    this.code = code;
    this.retryable = options.retryable ?? ['RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(code);
    this.detail = options.detail;
  }
}

/** Map an HTTP status from a detector API call to a normalized safe error code. */
export function detectorCodeForStatus(status: number): DetectorErrorCode {
  if (status === 401) return 'AUTHENTICATION_FAILED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408) return 'TIMEOUT';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  return 'INVALID_RESPONSE';
}

/** Normalize any thrown value from a detector into a safe {@link DetectorError}. */
export function normalizeDetectorError(error: unknown): DetectorError {
  if (error instanceof DetectorError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DetectorError('CANCELLED', 'Model detection was cancelled');
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new DetectorError('TIMEOUT', 'Model detector request timed out');
  }
  const message = error instanceof Error ? error.message : String(error);
  return new DetectorError('PROVIDER_UNAVAILABLE', message || 'Model detector request failed', {
    retryable: true,
  });
}
