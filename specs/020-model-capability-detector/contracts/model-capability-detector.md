# Contract: Model Capability Detector

**Feature**: 020-model-capability-detector
**Scope**: Server-only integration boundary

## Registry

Detectors are registered explicitly:

```ts
type AiModelDetectorSource = 'openrouter' | 'cloudflare';

type ModelCapabilityDetectorRegistry = Record<
  AiModelDetectorSource,
  (config: DetectorRuntimeConfig) => ModelCapabilityDetector
>;
```

Rules:

- No detector is loaded by filesystem convention or provider name.
- Unknown detector sources are rejected during provider configuration or sync
  setup.
- Detectors never import database tables and never write model rows directly.

## Runtime Config

```ts
type DetectorRuntimeConfig = {
  source: AiModelDetectorSource;
  providerId: string;
  providerName: string;
  providerType: 'chat' | 'embedding' | 'image';
  vendor: string;
  accountId?: string;
  namespace?: string;
  options: {
    includeDeprecated?: boolean;
    hideExperimental?: boolean;
    forceRefresh?: boolean;
  };
  credentials: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
};
```

Rules:

- Credentials exist only in server memory for the current operation.
- Logs, errors, action metadata, model metadata, and UI responses must not
  serialize `credentials`.
- `accountId` and `namespace` are admin-only metadata and must not be exposed
  outside AI admin surfaces.
- All detector network calls use bounded connect/read timeouts and cancellation.

## Interface

```ts
interface ModelCapabilityDetector {
  readonly source: AiModelDetectorSource;

  listModels(input: DetectorListInput): Promise<DetectorListResult>;
}

type DetectorListInput = {
  abortSignal: AbortSignal;
};

type DetectorListResult = {
  models: DetectedModel[];
  freshness: 'fresh' | 'cache';
  counts: {
    added?: number;
    updated?: number;
    unavailable?: number;
    skipped?: number;
    partial?: number;
  };
  warnings: DetectorWarning[];
};
```

The detector returns normalized results only. The AI admin service owns database
merge, manual override precedence, assignment validation, and action metadata.

## Detected Model

```ts
type DetectedModel = {
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

type DetectedCapability = {
  capability:
    | 'text_generation'
    | 'embedding'
    | 'image_generation'
    | 'vision'
    | 'audio'
    | 'thinking';
  supported: boolean;
  source: 'provider' | 'catalog';
  details: {
    detector: 'openrouter' | 'cloudflare';
    evidence: 'catalog' | 'schema' | 'catalog_and_schema';
    partial?: boolean;
    reason?: string;
  };
};
```

Rules:

- A capability row is emitted only when there is provider metadata evidence.
- If support cannot be proven, omit the positive row or mark it unsupported only
  when the provider explicitly says unsupported.
- Model names are never capability evidence.
- Raw metadata must be non-secret and bounded in size before persistence.

## OpenRouter Detector Mapping

Inputs:

- Existing global OpenRouter detector API key or OpenRouter provider credential.
- Optional vendor namespace from provider definition.

Mapping:

- `architecture.output_modalities` contains `text` -> `text_generation`.
- `architecture.output_modalities` contains `embeddings` -> `embedding`.
- `architecture.output_modalities` contains `image` -> `image_generation`.
- `architecture.input_modalities` contains `image` -> `vision`.
- `architecture.input_modalities` contains `audio` -> `audio`.
- `supported_parameters` contains `reasoning` or `include_reasoning` ->
  `thinking`.
- `context_length` or `top_provider.context_length` -> `contextWindow`.
- `top_provider.max_completion_tokens` -> `maxOutputTokens`.
- `embedding_dimensions` -> `embeddingDimensions`.

## Cloudflare Detector Mapping

Inputs:

- Cloudflare account ID from provider config.
- Cloudflare API token from encrypted provider credentials.

Cloudflare calls:

- Model search lists Workers AI models for the configured account.
- Model schema retrieves input and output JSON schema for a listed model.

Mapping:

- Model search task/category data is catalog evidence.
- Input schema fields indicating text input map to text-capable input.
- Input schema fields indicating image input map to `vision`.
- Input schema fields indicating audio input map to `audio`.
- Output schema fields indicating text output map to `text_generation`.
- Output schema fields indicating embedding/vector output map to `embedding`.
- Output schema fields indicating image output map to `image_generation`.
- Reasoning/thinking is emitted only when Cloudflare catalog or schema metadata
  explicitly proves it.
- Deprecated or unavailable catalog state maps to `availability`.

Partial behavior:

- Search success plus schema failure returns the model with catalog evidence and
  `partial=true`.
- Per-model schema failure creates a detector warning but does not fail the full
  run.
- A list-level Cloudflare failure fails the detector run with a normalized safe
  error.

## Normalized Errors

Detector failures use the existing AI provider error vocabulary where possible:

```ts
type DetectorErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'CAPABILITY_UNSUPPORTED'
  | 'CANCELLED';
```

Rules:

- Error messages are safe for administrator display.
- Raw provider responses are not persisted unless sanitized and bounded.
- Cloudflare account ID may be referenced only by provider label or redacted
  account suffix in admin-only diagnostics.
