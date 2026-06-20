# Provider Adapter Contract

**Feature**: 004-system-ai-support
**Scope**: Server-only integration boundary

## Registry

Adapters are registered explicitly:

```ts
type AiProviderKind = 'openai_compatible' | 'openrouter';

type AiProviderRegistry = Record<
  AiProviderKind,
  (config: ProviderRuntimeConfig) => AiProviderAdapter
>;
```

No adapter is loaded by filesystem convention or provider name. Unknown kinds
are rejected during configuration validation.

## Runtime configuration

```ts
type ProviderRuntimeConfig = {
  providerId: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string;
  config: Record<string, unknown>;
  credentials: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
};
```

Rules:

- credentials exist only in server memory for the current operation;
- logs and errors must not serialize `credentials`;
- base URLs must be absolute HTTP(S), contain no userinfo, and have bounded
  connection/read timeouts;
- private network endpoints are allowed because self-hosted model servers are a
  supported deployment, but only administrators may configure them.

## Interface

```ts
interface AiProviderAdapter {
  readonly kind: AiProviderKind;

  testConnection(): Promise<{
    ok: boolean;
    latencyMs: number;
    providerRequestId?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;

  listModels(): Promise<DiscoveredModel[]>;

  streamText(input: TextGenerationInput):
    AsyncIterable<TextGenerationEvent>;

  embed(input: EmbeddingInput): Promise<EmbeddingOutput>;

  generateImage(input: ImageGenerationInput):
    Promise<ImageGenerationOutput>;
}
```

Unsupported operations return normalized `CAPABILITY_UNSUPPORTED` without
probing a paid endpoint.

## Model discovery

```ts
type DiscoveredModel = {
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
    capability: 'text_generation' | 'embedding' | 'image_generation';
    supported: boolean;
    source: 'provider' | 'catalog';
    details?: Record<string, unknown>;
  }>;
  rawMetadata: Record<string, unknown>;
};
```

The generic OpenAI-compatible adapter may return no capability rows when the
model endpoint lacks evidence. Model names are never used as capability proof.

The OpenRouter adapter maps:

- output modality `text` → text generation;
- output modality `embeddings` → embedding;
- output modality `image` → image generation;
- `context_length` → context window;
- provider/canonical model ids → stable identity fields.

## Text generation

```ts
type TextGenerationInput = {
  actionId: string;
  modelExternalId: string;
  system: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal: AbortSignal;
};

type TextGenerationEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'provider_request_id'; id: string }
  | { type: 'done'; finishReason?: string };
```

Adapter obligations:

- reject malformed/non-finite usage values;
- enforce a maximum delta/event size;
- close network bodies on cancellation;
- normalize provider stream formats;
- never emit hidden reasoning content;
- provide no automatic provider/model fallback.

## Embeddings

```ts
type EmbeddingInput = {
  actionId: string;
  modelExternalId: string;
  inputs: string[];
  expectedDimensions: number;
  abortSignal: AbortSignal;
};

type EmbeddingOutput = {
  vectors: number[][];
  usage?: { inputTokens?: number };
  providerRequestId?: string;
};
```

Validation:

- output count equals input count;
- every vector length equals `expectedDimensions`;
- every value is finite;
- batch size and input byte size stay within configured limits;
- any invalid vector fails the whole batch before database writes.

## Image generation

```ts
type ImageGenerationInput = {
  actionId: string;
  modelExternalId: string;
  prompt: string;
  aspectRatio?: string;
  abortSignal: AbortSignal;
};

type ImageGenerationOutput =
  | {
      kind: 'bytes';
      bytes: Uint8Array;
      contentType: string;
      usage?: Record<string, number>;
    }
  | {
      kind: 'data_url';
      dataUrl: string;
      usage?: Record<string, number>;
    }
  | {
      kind: 'url';
      url: string;
      usage?: Record<string, number>;
    };
```

The service layer, not the adapter, applies the existing Wiki image validation,
size limit, hash, and temporary artifact persistence.

OpenRouter uses chat completions with image output modalities. The generic
OpenAI-compatible adapter may use an images-generation endpoint. These details
do not leak into caller services.

## Normalized errors

```ts
type AiProviderErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'MODEL_NOT_FOUND'
  | 'CAPABILITY_UNSUPPORTED'
  | 'RATE_LIMITED'
  | 'INPUT_TOO_LARGE'
  | 'CONTENT_REJECTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';
```

Errors include retryability and an optional retry-after value. Provider response
bodies are never persisted verbatim; sanitized messages are bounded before
logging or storing.

## Conformance tests

Every adapter must pass the same fixture suite:

- credential redaction;
- connection success/auth failure/timeout;
- empty and duplicate model ids;
- unknown capability metadata;
- valid and malformed SSE text streams;
- cancellation;
- embedding count/dimension/non-finite validation;
- image bytes/data URL/remote URL responses;
- rate-limit retry metadata;
- provider error bodies containing prompt text are sanitized.
