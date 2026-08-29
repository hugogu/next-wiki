import type { BridgeConfig } from './config';

export const BRIDGE_VERSION = '0.1.0';
const USER_AGENT = `next-wiki-openclaw-memory-bridge/${BRIDGE_VERSION}`;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class ApiClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiClientError';
  }
}

const ERROR_ACTIONS: Record<number, { code: string; message: string }> = {
  401: { code: 'unauthorized', message: 'The credential is invalid or revoked. Rotate or reconfigure the Agent memory connection credential.' },
  403: { code: 'forbidden', message: 'The credential lacks a required memory scope or its connection is disabled.' },
  404: { code: 'not_found', message: 'The requested memory record is unavailable in this destination.' },
  409: { code: 'not_durable', message: 'The capture is not durable yet. Poll again or wait for the Wiki worker.' },
  426: { code: 'incompatible', message: 'Upgrade the bridge or the Wiki to a compatible version.' },
};

export type RecallScope = 'own' | 'granted' | 'own_and_granted';

/**
 * Secret-safe v1 Agent Memory HTTP client. Mirrors the Hermes Python
 * provider's method set exactly (both adapters call the same generic
 * contract); never logs the credential or a response/request body.
 */
export class WikiApiClient {
  private readonly baseUrl: string;
  private readonly credential: string;

  constructor(config: Pick<BridgeConfig, 'wikiApiBaseUrl' | 'credential'>) {
    this.baseUrl = config.wikiApiBaseUrl;
    this.credential = config.credential;
  }

  connection(): Promise<Record<string, unknown>> {
    return this.request('GET', '/memory/connection');
  }

  diagnostics(): Promise<Record<string, unknown>> {
    return this.request('GET', '/memory/diagnostics');
  }

  recall(query: string, limit: number, scope?: RecallScope): Promise<Record<string, unknown>> {
    return this.request('POST', '/memory/recall', { query, limit, ...(scope ? { scope } : {}) });
  }

  save(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('POST', '/memory/records', payload);
  }

  forget(memoryId: string, reason?: string): Promise<Record<string, unknown>> {
    return this.request('DELETE', `/memory/records/${memoryId}`, reason ? { reason } : {});
  }

  submitEvidence(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('POST', '/memory/evidence', payload);
  }

  captureStatus(captureId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/memory/evidence/${captureId}`);
  }

  private async request(method: string, path: string, payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${this.credential}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          'X-Next-Wiki-Memory-Provider-Version': BRIDGE_VERSION,
        },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiClientError('timeout', 'The Wiki could not be reached within the request timeout.');
      }
      throw new ApiClientError('unavailable', 'The Wiki could not be reached. Check the URL, TLS, and network path.');
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new ApiClientError('invalid_response', 'The Wiki returned an oversized response; check the API URL and reverse proxy.');
    }

    if (!response.ok) {
      const action = ERROR_ACTIONS[response.status] ?? { code: 'unavailable', message: 'The Wiki rejected the request.' };
      throw new ApiClientError(action.code, action.message);
    }

    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      throw new ApiClientError('invalid_response', 'The Wiki returned an invalid response.');
    }
  }
}
