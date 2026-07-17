import type { AiCapability } from '@next-wiki/shared';
import type {
  DetectedCapability,
  DetectedModel,
  DetectorEvidence,
  DetectorListInput,
  DetectorListResult,
  DetectorRuntimeConfig,
  DetectorWarning,
  ModelCapabilityDetector,
} from './types';
import { DetectorError, detectorCodeForStatus, normalizeDetectorError } from './types';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15_000;
// Bound per-model schema concurrency so a large catalog does not open hundreds
// of sockets at once; the model_sync action budget absorbs the total latency.
const SCHEMA_CONCURRENCY = 4;

type CloudflareProperty = { property_id?: string; value?: unknown };
type CloudflareModel = {
  id?: string;
  name?: string;
  description?: string;
  task?: { id?: string; name?: string };
  tags?: string[];
  properties?: CloudflareProperty[];
};
type CloudflareEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ message?: string }> };
type JsonSchema = {
  type?: string;
  format?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  [key: string]: unknown;
};

function propertyValue(model: CloudflareModel, propertyId: string): string | undefined {
  const match = model.properties?.find((property) => property.property_id === propertyId);
  return match ? String(match.value) : undefined;
}

function isTruthyProperty(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

/** Detect whether a JSON schema (or nested property) describes image content. */
function schemaMentionsImage(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  return keysMatch(schema, /image|photo|picture/);
}

function schemaMentionsAudio(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  return keysMatch(schema, /audio|speech|voice/);
}

function schemaMentionsText(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  return keysMatch(schema, /prompt|text|message|response|input|question/);
}

function schemaMentionsEmbedding(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  return keysMatch(schema, /embedding|vector|data/);
}

/** True when any property name in the schema tree matches `pattern`. */
function keysMatch(schema: JsonSchema | undefined, pattern: RegExp, depth = 0): boolean {
  if (!schema || depth > 4) return false;
  const properties = schema.properties;
  if (properties) {
    for (const [key, child] of Object.entries(properties)) {
      if (pattern.test(key)) return true;
      if (keysMatch(child, pattern, depth + 1)) return true;
    }
  }
  if (schema.items && keysMatch(schema.items, pattern, depth + 1)) return true;
  return false;
}

const CATALOG_TASK_CAPABILITIES: Array<{ pattern: RegExp; capability: AiCapability; input?: string; output?: string }> = [
  { pattern: /text generation|text2text|summarization|translation/i, capability: 'text_generation', input: 'text', output: 'text' },
  { pattern: /text embeddings?/i, capability: 'embedding', input: 'text', output: 'embeddings' },
  { pattern: /text-to-image/i, capability: 'image_generation', input: 'text', output: 'image' },
  { pattern: /image-to-text|image classification|object detection/i, capability: 'vision', input: 'image', output: 'text' },
  { pattern: /automatic speech recognition|speech/i, capability: 'audio', input: 'audio', output: 'text' },
];

export class CloudflareDetector implements ModelCapabilityDetector {
  readonly source = 'cloudflare' as const;

  constructor(private readonly config: DetectorRuntimeConfig) {}

  async listModels(input: DetectorListInput): Promise<DetectorListResult> {
    const accountId = this.config.accountId;
    if (!accountId) {
      throw new DetectorError('PROVIDER_UNAVAILABLE', 'Cloudflare detector requires an account ID');
    }
    if (!this.config.credentials.apiKey) {
      throw new DetectorError('AUTHENTICATION_FAILED', 'Cloudflare detector requires an API token');
    }

    const catalog = await this.fetchCatalog(accountId, input.abortSignal);
    const warnings: DetectorWarning[] = [];
    const models: DetectedModel[] = [];
    let unavailable = 0;
    let partialCount = 0;
    let skipped = 0;

    const includeDeprecated = this.config.options.includeDeprecated ?? false;
    const hideExperimental = this.config.options.hideExperimental ?? true;

    // Enrich models with per-model schema, bounded by SCHEMA_CONCURRENCY.
    const pending = [...catalog];
    const worker = async () => {
      for (;;) {
        const model = pending.shift();
        if (!model) return;
        const name = model.name ?? model.id;
        if (!name) {
          skipped++;
          continue;
        }
        const deprecated = isTruthyProperty(propertyValue(model, 'deprecated')) || model.tags?.includes('deprecated');
        const experimental = isTruthyProperty(propertyValue(model, 'beta')) ||
          isTruthyProperty(propertyValue(model, 'experimental'));
        if (deprecated && !includeDeprecated) {
          skipped++;
          continue;
        }
        if (experimental && hideExperimental) {
          skipped++;
          continue;
        }

        let schema: { input?: JsonSchema; output?: JsonSchema } | null = null;
        let partial = false;
        try {
          schema = await this.fetchSchema(accountId, name, input.abortSignal);
        } catch (error) {
          const normalized = normalizeDetectorError(error);
          if (normalized.code === 'CANCELLED') throw normalized;
          partial = true;
          partialCount++;
          warnings.push({ modelExternalId: name, code: 'SCHEMA_UNAVAILABLE' });
        }

        const detected = this.normalize(model, name, schema, partial);
        if (deprecated) {
          detected.availability = 'unavailable';
          unavailable++;
        }
        models.push(detected);
      }
    };
    await Promise.all(Array.from({ length: SCHEMA_CONCURRENCY }, worker));

    return {
      models,
      freshness: this.config.options.forceRefresh ? 'fresh' : 'fresh',
      counts: { unavailable, partial: partialCount, skipped },
      warnings,
    };
  }

  private async fetchCatalog(accountId: string, abortSignal: AbortSignal): Promise<CloudflareModel[]> {
    const url = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/ai/models/search`;
    const envelope = await this.request<CloudflareModel[]>(url, abortSignal);
    return envelope.result ?? [];
  }

  private async fetchSchema(
    accountId: string,
    modelName: string,
    abortSignal: AbortSignal,
  ): Promise<{ input?: JsonSchema; output?: JsonSchema }> {
    const url =
      `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/ai/models/schema` +
      `?model=${encodeURIComponent(modelName)}`;
    const envelope = await this.request<{ input?: JsonSchema; output?: JsonSchema }>(url, abortSignal);
    return envelope.result ?? {};
  }

  private async request<T>(url: string, abortSignal: AbortSignal): Promise<CloudflareEnvelope<T>> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.credentials.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.any([abortSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    if (!response.ok) {
      throw new DetectorError(detectorCodeForStatus(response.status), `Cloudflare responded ${response.status}`);
    }
    let envelope: CloudflareEnvelope<T>;
    try {
      envelope = (await response.json()) as CloudflareEnvelope<T>;
    } catch {
      throw new DetectorError('INVALID_RESPONSE', 'Cloudflare returned a non-JSON response');
    }
    if (envelope.success === false) {
      throw new DetectorError('INVALID_RESPONSE', 'Cloudflare reported an unsuccessful response');
    }
    return envelope;
  }

  /** Merge catalog task evidence and schema evidence into a normalized model. */
  private normalize(
    model: CloudflareModel,
    name: string,
    schema: { input?: JsonSchema; output?: JsonSchema } | null,
    partial: boolean,
  ): DetectedModel {
    const taskName = model.task?.name ?? '';
    const inputModalities = new Set<string>();
    const outputModalities = new Set<string>();
    // capability -> evidence sources seen
    const byCapability = new Map<AiCapability, Set<DetectorEvidence>>();
    const add = (capability: AiCapability, evidence: DetectorEvidence) => {
      const set = byCapability.get(capability) ?? new Set<DetectorEvidence>();
      set.add(evidence);
      byCapability.set(capability, set);
    };

    for (const entry of CATALOG_TASK_CAPABILITIES) {
      if (entry.pattern.test(taskName)) {
        add(entry.capability, 'catalog');
        if (entry.input) inputModalities.add(entry.input);
        if (entry.output) outputModalities.add(entry.output);
      }
    }

    if (schema) {
      if (schemaMentionsImage(schema.input)) {
        add('vision', 'schema');
        inputModalities.add('image');
      }
      if (schemaMentionsAudio(schema.input)) {
        add('audio', 'schema');
        inputModalities.add('audio');
      }
      if (schemaMentionsText(schema.input)) inputModalities.add('text');
      if (schemaMentionsImage(schema.output)) {
        add('image_generation', 'schema');
        outputModalities.add('image');
      }
      if (schemaMentionsEmbedding(schema.output)) {
        add('embedding', 'schema');
        outputModalities.add('embeddings');
      } else if (schemaMentionsText(schema.output)) {
        add('text_generation', 'schema');
        outputModalities.add('text');
      }
    }

    const capabilities: DetectedCapability[] = [...byCapability.entries()].map(([capability, evidenceSet]) => {
      const evidence: DetectorEvidence =
        evidenceSet.has('catalog') && evidenceSet.has('schema')
          ? 'catalog_and_schema'
          : evidenceSet.has('schema')
            ? 'schema'
            : 'catalog';
      return {
        capability,
        supported: true,
        source: 'provider',
        details: { detector: 'cloudflare', evidence, ...(partial ? { partial: true } : {}) },
      };
    });

    return {
      externalId: name,
      displayName: model.name ?? name,
      availability: 'available',
      inputModalities: [...inputModalities],
      outputModalities: [...outputModalities],
      capabilities,
      partial,
      rawMetadata: {
        // Bounded, non-secret catalog metadata plus detector provenance.
        task: taskName || null,
        description: typeof model.description === 'string' ? model.description.slice(0, 1_000) : null,
        detector: { source: 'cloudflare', evidence: schema ? 'catalog_and_schema' : 'catalog', partial },
      },
    };
  }
}
