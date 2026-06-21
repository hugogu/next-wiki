import type {
  AiApiErrorCode,
  AiCapability,
  AiProviderKind,
  AiProviderType,
  AiProviderVendor,
} from '@next-wiki/shared';

export type ProviderCredentials = {
  apiKey?: string;
  headers?: Record<string, string>;
};

export type ProviderRuntimeConfig = {
  providerId: string;
  name: string;
  type: AiProviderType;
  vendor: AiProviderVendor;
  kind: AiProviderKind;
  baseUrl: string;
  config: Record<string, unknown>;
  credentials: ProviderCredentials;
};

export type ProviderHealth = {
  ok: boolean;
  latencyMs: number;
  providerRequestId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type DiscoveredModel = {
  externalId: string;
  canonicalId?: string;
  displayName: string;
  availability: 'available' | 'unavailable' | 'unknown';
  contextWindow?: number;
  maxOutputTokens?: number;
  embeddingDimensions?: number;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: Array<{
    capability: AiCapability;
    supported: boolean;
    source: 'provider' | 'catalog';
    details?: Record<string, unknown>;
  }>;
  rawMetadata: Record<string, unknown>;
};

export type TextGenerationInput = {
  actionId: string;
  modelExternalId: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal: AbortSignal;
};
export type TextGenerationEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'provider_request_id'; id: string }
  | { type: 'done'; finishReason?: string };

export type EmbeddingInput = {
  actionId: string;
  modelExternalId: string;
  inputs: string[];
  expectedDimensions: number;
  abortSignal: AbortSignal;
};
export type EmbeddingOutput = {
  vectors: number[][];
  usage?: { inputTokens?: number };
  providerRequestId?: string;
};

export type ImageGenerationInput = {
  actionId: string;
  modelExternalId: string;
  prompt: string;
  aspectRatio?: string;
  abortSignal: AbortSignal;
};
export type ImageGenerationOutput =
  | { kind: 'bytes'; bytes: Uint8Array; contentType: string; usage?: Record<string, number> }
  | { kind: 'data_url'; dataUrl: string; usage?: Record<string, number> }
  | { kind: 'url'; url: string; usage?: Record<string, number> };

export interface AiProviderAdapter {
  readonly kind: AiProviderKind;
  testConnection(): Promise<ProviderHealth>;
  listModels(): Promise<DiscoveredModel[]>;
  streamText(input: TextGenerationInput): AsyncIterable<TextGenerationEvent>;
  embed(input: EmbeddingInput): Promise<EmbeddingOutput>;
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}

export function unsupportedProviderOperation(operation: string): never {
  throw new AiProviderError(
    'CAPABILITY_UNSUPPORTED',
    `The configured provider protocol does not support ${operation}`,
  );
}

const SAFE_CODES = new Set<AiApiErrorCode>([
  'CAPABILITY_UNSUPPORTED',
  'RATE_LIMITED',
  'INPUT_TOO_LARGE',
  'CONTENT_REJECTED',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'INVALID_RESPONSE',
  'CANCELLED',
  'MODEL_NOT_FOUND',
]);

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiApiErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterMs?: number,
  ) {
    super(sanitizeProviderMessage(message));
    this.name = 'AiProviderError';
  }
}

export function normalizeProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AiProviderError('CANCELLED', 'AI request was cancelled');
  }
  const value = error as { code?: unknown; message?: unknown };
  const code =
    typeof value?.code === 'string' && SAFE_CODES.has(value.code as AiApiErrorCode)
      ? (value.code as AiApiErrorCode)
      : 'PROVIDER_UNAVAILABLE';
  return new AiProviderError(code, String(value?.message ?? 'AI provider request failed'), true);
}

export function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|authorization|prompt|input|question|selection|response|image)["']?\s*[:=]\s*["'][^"']+["']/gi, '$1=[REDACTED]')
    .slice(0, 500);
}
