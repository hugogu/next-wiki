import type { BridgeConfig } from './config';
import { resolveCredential } from './config';

export type MemoryCitation = {
  pageId: string;
  revisionId: string;
  revisionHash: string;
  title: string;
  canonicalUrl: string;
  createdAt: string;
};

export type MemoryResult = {
  memoryId: string;
  type: 'memory' | 'evidence';
  state: 'active' | 'forgotten' | 'archived';
  title: string;
  excerpt: string;
  citation: MemoryCitation;
  evidence: Array<{ evidenceId: string; relation: string; citation: MemoryCitation }>;
  role?: string;
  origin?: string;
  destinationRole?: string;
  authorConnectionId?: string;
};

export type ConnectionView = {
  connectionId: string;
  agentIdentity: string;
  displayLabel: string;
  state: 'active' | 'disabled' | 'revoked';
  capabilities: { recall: boolean; save: boolean; forget: boolean; capture: boolean };
};

export class WikiMemoryError extends Error {
  constructor(public readonly code: string, message = 'next-wiki memory request failed') {
    super(message);
    this.name = 'WikiMemoryError';
  }
}

export class WikiMemoryClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: BridgeConfig) {
    this.baseUrl = config.wikiApiBaseUrl.replace(/\/+$/u, '');
    this.token = resolveCredential(config.credential);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');
    headers.set('x-next-wiki-memory-provider-version', '2');
    if (init.body) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new WikiMemoryError('unreachable');
    }
    const body = await response.json().catch(() => null) as { code?: string; message?: string } | T | null;
    if (!response.ok) {
      const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'remote_error';
      throw new WikiMemoryError(code);
    }
    return body as T;
  }

  connection(): Promise<ConnectionView> {
    return this.request<ConnectionView>('/connection');
  }

  recall(query: string, scope: 'own' | 'granted' | 'own_and_granted' = 'granted', limit = 3): Promise<{ results: MemoryResult[] }> {
    return this.request('/recall', { method: 'POST', body: JSON.stringify({ query, scope, limit }) });
  }

  save(input: { idempotencyKey: string; content: string; title?: string; origin?: string; role?: string }): Promise<{ record: MemoryResult; idempotent: boolean }> {
    return this.request('/records', { method: 'POST', body: JSON.stringify(input) });
  }

  forget(memoryId: string): Promise<{ memoryId: string; state: string; forgottenAt: string }> {
    return this.request(`/records/${encodeURIComponent(memoryId)}`, { method: 'DELETE', body: '{}' });
  }

  setRecordState(memoryId: string, state: 'active' | 'forgotten' | 'archived'): Promise<{ memoryId: string; state: string; forgottenAt: string | null }> {
    return this.request(`/records/${encodeURIComponent(memoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    });
  }

  capture(input: { idempotencyKey: string; sessionDigest: string; checkpoint: boolean; messages: Array<{ role: 'user' | 'assistant'; content: string }>; origin?: string }): Promise<{ captureId: string; status: string; pollUrl: string; idempotent: boolean }> {
    return this.request('/captures', { method: 'POST', body: JSON.stringify(input) });
  }

  status(): Promise<Record<string, unknown>> {
    return this.request('/diagnostics');
  }
}
