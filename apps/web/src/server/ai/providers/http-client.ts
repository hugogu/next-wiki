import { env } from '@/server/config';
import { AiProviderError, sanitizeProviderMessage, type ProviderRuntimeConfig } from '../types';

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * A secret-free summary of how the request authenticates, for the admin
 * run-record viewer: it reveals whether an auth header was actually sent and
 * how long the key is, without ever exposing the key itself.
 */
export function describeAuth(config: ProviderRuntimeConfig): Record<string, unknown> {
  const scheme = config.kind === 'anthropic' ? 'x-api-key' : 'Bearer';
  return {
    scheme: config.credentials.apiKey ? scheme : 'none',
    apiKeyChars: config.credentials.apiKey?.length ?? 0,
    customHeaders: Object.keys(config.credentials.headers ?? {}),
  };
}

export function providerHeaders(config: ProviderRuntimeConfig): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (config.credentials.apiKey) {
    if (config.kind === 'anthropic') {
      headers.set('x-api-key', config.credentials.apiKey);
      headers.set('anthropic-version', '2023-06-01');
    } else {
      headers.set('authorization', `Bearer ${config.credentials.apiKey}`);
    }
  }
  for (const [name, value] of Object.entries(config.credentials.headers ?? {})) {
    if (!['host', 'content-length'].includes(name.toLowerCase())) headers.set(name, value);
  }
  return headers;
}

export async function providerFetch(
  config: ProviderRuntimeConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs = env.AI_PROVIDER_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const url = new URL(path.replace(/^\//, ''), `${config.baseUrl.replace(/\/+$/, '')}/`);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init.headers ?? providerHeaders(config),
      redirect: 'error',
      signal: combineSignals(init.signal ?? undefined, timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new AiProviderError(
        error.name === 'AbortError' ? 'CANCELLED' : 'TIMEOUT',
        error.name === 'AbortError' ? 'AI request was cancelled' : 'AI provider request timed out',
        error.name !== 'AbortError',
      );
    }
    throw new AiProviderError('PROVIDER_UNAVAILABLE', 'AI provider is unavailable', true);
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 16 * 1024 * 1024) {
    await response.body?.cancel();
    throw new AiProviderError('INPUT_TOO_LARGE', 'Provider response is too large');
  }
  if (response.ok) return response;

  const retryAfter = response.headers.get('retry-after');
  const text = sanitizeProviderMessage(
    new TextDecoder().decode(await readBoundedBytes(response, 64 * 1024).catch(() => new Uint8Array())),
  );
  // Request/response context for the admin run-record viewer. The URL never
  // carries the API key (it travels in the Authorization header) and the body
  // is already sanitized, so this is safe to persist.
  const detail = {
    request: { method: init.method ?? 'GET', url: url.toString(), auth: describeAuth(config) },
    response: { status: response.status, body: text },
  };
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderError('PROVIDER_UNAVAILABLE', 'AI provider rejected the credentials', false, undefined, detail);
  }
  if (response.status === 404) throw new AiProviderError('MODEL_NOT_FOUND', 'AI model was not found', false, undefined, detail);
  if (response.status === 413) throw new AiProviderError('INPUT_TOO_LARGE', 'AI provider rejected the input size', false, undefined, detail);
  if (response.status === 429) {
    throw new AiProviderError('RATE_LIMITED', 'AI provider rate limit exceeded', true, parseRetryAfter(retryAfter), detail);
  }
  if (response.status >= 500) {
    throw new AiProviderError('PROVIDER_UNAVAILABLE', text || 'AI provider is unavailable', true, undefined, detail);
  }
  throw new AiProviderError('INVALID_RESPONSE', text || `AI provider returned ${response.status}`, false, undefined, detail);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maximumBytes) throw new AiProviderError('INPUT_TOO_LARGE', 'Provider response is too large');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new AiProviderError('INPUT_TOO_LARGE', 'Provider response is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readBoundedJson<T>(response: Response, maximumBytes = 16 * 1024 * 1024): Promise<T> {
  const bytes = await readBoundedBytes(response, maximumBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new AiProviderError('INVALID_RESPONSE', 'Provider returned malformed JSON');
  }
}
