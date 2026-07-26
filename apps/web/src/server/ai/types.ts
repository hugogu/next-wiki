import type {
  AiApiErrorCode,
  AiCapability,
  AiProviderKind,
  AiProviderType,
  AiProviderVendor,
  NeutralToolCall,
  NeutralToolDefinition,
  NeutralToolResult,
} from '@next-wiki/shared';
import { logger } from '@/server/logger';

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
  // Sanitized request/response context for the admin run-record viewer.
  detail?: Record<string, unknown>;
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

/**
 * One turn in a conversation. `toolCalls` records what an assistant turn asked
 * for; `toolResults` carries the runtime's bounded answers back. Adapters place
 * both wherever their wire format expects — assistant `tool_calls` plus `role:
 * "tool"` messages for OpenAI-compatible endpoints, `tool_use` and `tool_result`
 * content blocks for Anthropic — so callers never branch on vendor (028, FR-001).
 */
export type TextGenerationMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: NeutralToolCall[];
  toolResults?: NeutralToolResult[];
};

export type TextGenerationInput = {
  actionId: string;
  modelExternalId: string;
  system: string;
  messages: TextGenerationMessage[];
  /** Tools offered to the model for this turn. Omitted or empty means the
   * request is a plain text completion and must behave exactly as before. */
  tools?: NeutralToolDefinition[];
  maxOutputTokens?: number;
  temperature?: number;
  /** `null` disables the transport timeout; callers must then supply an abort signal. */
  timeoutMs?: number | null;
  abortSignal: AbortSignal;
};
export type TextGenerationEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  /** Emitted once per completed tool call, after its arguments are whole.
   * Partial argument fragments are buffered by the adapter, never emitted. */
  | { type: 'tool_call'; call: NeutralToolCall }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number }
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
  /** Whether this adapter can express tools in the provider's own protocol.
   * A static property of the adapter, not of the configured model — per-model
   * selection lives in `ai_models.tool_call_strategy`. An adapter that returns
   * false MUST reject a request carrying tools rather than silently dropping
   * them, so a caller can never believe tools were offered when they were not. */
  readonly supportsNativeTools: boolean;
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

/**
 * Recognize a provider rejecting the tool payload itself — as opposed to
 * failing for an unrelated reason. Used to downgrade a model to the text
 * protocol and retry the same turn, so the user's request never fails merely
 * because a model advertised tool support it does not have (028, FR-002).
 */
export function isNativeToolUnsupportedError(error: unknown): boolean {
  if (!(error instanceof AiProviderError)) return false;
  if (error.code === 'CAPABILITY_UNSUPPORTED') return true;
  // Only a client-side rejection counts. Rate limits and 5xx are transient and
  // must never mark a model as tool-incapable, even if their prose happens to
  // mention tools — the downgrade is persistent.
  if (error.code !== 'INVALID_RESPONSE') return false;
  // Providers report this as a 400 with free-text prose rather than a stable
  // code, and the two halves of the sentence arrive in either order:
  // "'tools' is not supported with this model", "does not support tool use".
  const mentionsTools =
    /\btools?\b|\btool[_ ](?:choice|call|use)s?\b|\bfunction[_ ]call(?:ing)?\b/i.test(error.message);
  const mentionsUnsupported =
    /not supported|unsupported|not permitted|does not support|no support for|invalid parameter/i.test(
      error.message,
    );
  return mentionsTools && mentionsUnsupported;
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
    // Sanitized request/response context, surfaced in the admin run-record viewer.
    public readonly detail?: Record<string, unknown>,
  ) {
    super(sanitizeProviderMessage(message));
    this.name = 'AiProviderError';
  }
}

/**
 * Recognize the provider error that means the request (input + requested
 * output) exceeded the model's context window. Providers surface this as a 400
 * with free-text prose rather than a stable code, so match the well-known
 * phrasings. Callers use it to trigger a compressed retry.
 */
export function isContextLengthExceededError(error: unknown): boolean {
  if (!(error instanceof AiProviderError)) return false;
  return /context[_ ](?:length|window)|maximum context|reduce the length|prompt is too long|too many (?:input |prompt )?tokens/i.test(
    error.message,
  );
}

export function normalizeProviderError(error: unknown, context?: { actionId?: string; providerName?: string; modelExternalId?: string }): AiProviderError {
  if (error instanceof AiProviderError) {
    logger.warn('AI provider returned a normalized error', {
      actionId: context?.actionId,
      providerName: context?.providerName,
      modelExternalId: context?.modelExternalId,
      code: error.code,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      message: error.message,
    });
    return error;
  }
  const errorName = error instanceof Error ? error.name : undefined;
  if (errorName === 'TimeoutError') {
    logger.warn('AI provider timed out', { actionId: context?.actionId, providerName: context?.providerName });
    return new AiProviderError('TIMEOUT', 'AI provider response timed out', true);
  }
  if (errorName === 'AbortError') {
    logger.info('AI provider request aborted (likely user cancel)', { actionId: context?.actionId });
    return new AiProviderError('CANCELLED', 'AI request was cancelled');
  }
  const value = error as { code?: unknown; message?: unknown };
  const code =
    typeof value?.code === 'string' && SAFE_CODES.has(value.code as AiApiErrorCode)
      ? (value.code as AiApiErrorCode)
      : 'PROVIDER_UNAVAILABLE';
  const message = String(value?.message ?? 'AI provider request failed');
  // Unrecognized shapes get logged with the full error so we can triage unknown
  // provider failure modes from log alone — without context this is just noise.
  logger.warn('AI provider returned an unrecognized error shape', {
    actionId: context?.actionId,
    providerName: context?.providerName,
    modelExternalId: context?.modelExternalId,
    normalizedCode: code,
    rawErrorName: errorName,
    rawMessage: message,
  });
  return new AiProviderError(code, message, true);
}

/**
 * Resolve after `ms`, rejecting early with an `AbortError` if `signal` aborts
 * during the wait. Keeps retry backoff responsive to user cancellation.
 */
function abortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AiProviderError('CANCELLED', 'AI request was cancelled'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AiProviderError('CANCELLED', 'AI request was cancelled'));
      },
      { once: true },
    );
  });
}

/**
 * Maximum number of times a mid-stream connection drop is retried before the
 * failure surfaces. Long-running streaming requests to a provider (notably
 * OpenRouter) can be reset mid-stream by intermediary proxies/VPNs; retrying
 * salvages turns that would otherwise be lost entirely.
 */
export const STREAM_RETRY_MAX_DEFAULT = 2;
export const STREAM_RETRY_BASE_DELAY_MS = 750;

/**
 * Drive a streaming text generation with bounded retries on transient
 * provider failures. A retry is only attempted while **no answer text has
 * committed**: once a `delta` event (the actual answer/tool-plan text) has
 * been yielded, the stream is committed and a subsequent failure propagates,
 * so a partial answer/tool-plan is never duplicated.
 *
 * `reasoning_delta` does NOT commit the stream — reasoning is auxiliary, so a
 * drop during the reasoning phase (the common case for deep-reasoning models)
 * is retried. The retried attempt may re-emit reasoning, which the caller
 * appends; this is preferable to losing the whole turn.
 */
export async function* streamTextWithRetry(
  invoke: () => AsyncIterable<TextGenerationEvent>,
  options: { maxRetries?: number; baseDelayMs?: number; signal?: AbortSignal; actionId?: string; providerName?: string; modelExternalId?: string } = {},
): AsyncGenerator<TextGenerationEvent> {
  const maxRetries = options.maxRetries ?? STREAM_RETRY_MAX_DEFAULT;
  const baseDelayMs = options.baseDelayMs ?? STREAM_RETRY_BASE_DELAY_MS;
  let committed = false;
  for (let attempt = 0; ; attempt += 1) {
    try {
      for await (const event of invoke()) {
        if (event.type === 'delta') committed = true;
        yield event;
      }
      if (attempt > 0) {
        logger.info('AI stream recovered after retry', {
          actionId: options.actionId,
          providerName: options.providerName,
          modelExternalId: options.modelExternalId,
          attempts: attempt + 1,
        });
      }
      return;
    } catch (error) {
      const normalized = normalizeProviderError(error, {
        actionId: options.actionId,
        providerName: options.providerName,
        modelExternalId: options.modelExternalId,
      });
      const canRetry =
        !committed &&
        attempt < maxRetries &&
        normalized.retryable &&
        normalized.code !== 'CANCELLED' &&
        !options.signal?.aborted;
      if (!canRetry) {
        logger.warn('AI stream failed without retry', {
          actionId: options.actionId,
          providerName: options.providerName,
          modelExternalId: options.modelExternalId,
          attempts: attempt + 1,
          committed,
          code: normalized.code,
          retryable: normalized.retryable,
          reason: committed
            ? 'stream-already-committed'
            : attempt >= maxRetries
              ? 'max-retries-exceeded'
              : normalized.code === 'CANCELLED'
                ? 'cancelled'
                : 'not-retryable',
        });
        throw normalized;
      }
      const delay = normalized.retryAfterMs ?? baseDelayMs * 2 ** attempt;
      logger.warn('AI stream retrying', {
        actionId: options.actionId,
        providerName: options.providerName,
        modelExternalId: options.modelExternalId,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        code: normalized.code,
        delayMs: delay,
      });
      await abortableDelay(delay, options.signal);
    }
  }
}

export function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|authorization|prompt|input|question|selection|response|image)["']?\s*[:=]\s*["'][^"']+["']/gi, '$1=[REDACTED]')
    .slice(0, 500);
}
