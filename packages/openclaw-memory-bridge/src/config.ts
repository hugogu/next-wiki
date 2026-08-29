export type CaptureMode = 'turn' | 'checkpoint' | 'compaction' | 'session_end';

export type BridgeConfig = {
  wikiApiBaseUrl: string;
  credential: string;
  capture: {
    enabled: boolean;
    modes: CaptureMode[];
  };
  /** Optional static agent_memory_search/save/forget/status tools. Disabled by default. */
  tools: {
    enabled: boolean;
  };
  promptEnrichment: {
    enabled: boolean;
  };
};

const CAPTURE_MODES: readonly CaptureMode[] = ['turn', 'checkpoint', 'compaction', 'session_end'];

export class ConfigError extends Error {}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strict, additive-only parsing of the plugin's own validated config
 * (`api.pluginConfig`). Never logs or includes the credential in any thrown
 * error message — configuration errors must remain diagnosable without a
 * secret ever leaving this function.
 */
export function parseBridgeConfig(raw: unknown): BridgeConfig {
  if (!isRecord(raw)) {
    throw new ConfigError('Agent memory bridge configuration must be an object');
  }

  const wikiApiBaseUrl = requireString(raw.wikiApiBaseUrl, 'wikiApiBaseUrl');
  let url: URL;
  try {
    url = new URL(wikiApiBaseUrl);
  } catch {
    throw new ConfigError('wikiApiBaseUrl must be a valid absolute URL');
  }
  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocalHost) {
    throw new ConfigError('wikiApiBaseUrl must use https outside local development');
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
    throw new ConfigError('wikiApiBaseUrl must end in /api/v1');
  }

  // The credential must be a reference the operator resolves (e.g. an env
  // var name or secret-store path) rather than a literal committed to a
  // plugin config file; this bridge only requires that it be a non-empty
  // string and never inspects, transforms, or logs its value.
  const credential = requireString(raw.credential, 'credential');

  const captureRaw = raw.capture;
  let enabled = false;
  let modes: CaptureMode[] = [];
  if (captureRaw !== undefined) {
    if (!isRecord(captureRaw)) {
      throw new ConfigError('capture must be an object');
    }
    if (captureRaw.enabled !== undefined) {
      if (typeof captureRaw.enabled !== 'boolean') {
        throw new ConfigError('capture.enabled must be a boolean');
      }
      enabled = captureRaw.enabled;
    }
    if (captureRaw.modes !== undefined) {
      if (!Array.isArray(captureRaw.modes) || !captureRaw.modes.every((mode) => CAPTURE_MODES.includes(mode as CaptureMode))) {
        throw new ConfigError(`capture.modes must only contain ${CAPTURE_MODES.join(', ')}`);
      }
      modes = Array.from(new Set(captureRaw.modes as CaptureMode[]));
    }
  }
  // Automatic capture is disabled by default (FR-014); an operator who
  // enables it without selecting modes gets no supported lifecycle
  // observation wired up, which is a safe (inert) default rather than an
  // implicit "capture everything" behavior.

  const promptEnrichmentRaw = raw.promptEnrichment;
  let promptEnrichmentEnabled = false;
  if (promptEnrichmentRaw !== undefined) {
    if (!isRecord(promptEnrichmentRaw)) {
      throw new ConfigError('promptEnrichment must be an object');
    }
    if (promptEnrichmentRaw.enabled !== undefined) {
      if (typeof promptEnrichmentRaw.enabled !== 'boolean') {
        throw new ConfigError('promptEnrichment.enabled must be a boolean');
      }
      promptEnrichmentEnabled = promptEnrichmentRaw.enabled;
    }
  }

  const toolsRaw = raw.tools;
  let toolsEnabled = false;
  if (toolsRaw !== undefined) {
    if (!isRecord(toolsRaw)) {
      throw new ConfigError('tools must be an object');
    }
    if (toolsRaw.enabled !== undefined) {
      if (typeof toolsRaw.enabled !== 'boolean') {
        throw new ConfigError('tools.enabled must be a boolean');
      }
      toolsEnabled = toolsRaw.enabled;
    }
  }

  return {
    wikiApiBaseUrl: wikiApiBaseUrl.replace(/\/$/, ''),
    credential,
    capture: { enabled, modes },
    tools: { enabled: toolsEnabled },
    promptEnrichment: { enabled: promptEnrichmentEnabled },
  };
}
