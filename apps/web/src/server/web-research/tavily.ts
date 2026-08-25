import { createHash } from 'node:crypto';
import { beginOutboundRequestCapture } from '@/server/services/request-log';
import type { WebOpenInput, WebOpenedSource, WebResearchConnector, WebSearchInput, WebSearchResult } from './types';

const TAVILY_URL = 'https://api.tavily.com';

async function request(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  operation: 'search' | 'extract' | 'connection_test',
  correlationId?: string,
): Promise<Response> {
  const target = `${TAVILY_URL}${path}`;
  const complete = await beginOutboundRequestCapture({
    source: { sourceType: 'web_research', providerKey: 'tavily', operation, correlationId },
    method: 'POST',
    target,
    safeMetadataOnly: true,
  });
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      complete?.({ response, outcome: 'http_error' });
      if (response.status === 429) throw new Error('WEB_RESEARCH_RATE_LIMITED');
      throw new Error(`WEB_RESEARCH_HTTP_${response.status}`);
    }
    complete?.({ response, outcome: 'success' });
    return response;
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('WEB_RESEARCH_HTTP_')) &&
      !(error instanceof Error && error.message === 'WEB_RESEARCH_RATE_LIMITED')) {
      complete?.({
        outcome: error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
          ? 'timeout'
          : 'transport_error',
        error,
      });
    }
    throw error;
  }
}

function bounded(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').slice(0, max) : '';
}

export const tavilyConnector: WebResearchConnector = {
  id: 'tavily',
  displayName: 'Tavily',
  async search(input: WebSearchInput, apiKey: string): Promise<WebSearchResult> {
    const started = Date.now();
    const response = await request(
      '/search',
      {
        api_key: apiKey,
        query: input.query,
        search_depth: 'basic',
        max_results: input.maxResults,
        chunks_per_source: 1,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        auto_parameters: false,
        ...(input.allowedDomains.length ? { include_domains: input.allowedDomains } : {}),
        ...(input.blockedDomains.length ? { exclude_domains: input.blockedDomains } : {}),
      },
      input.timeoutMs,
      input.auditOperation ?? 'search',
      input.auditCorrelationId,
    );
    const payload = (await response.json()) as { results?: unknown[]; request_id?: string; response_time?: number; usage?: { credits?: number } };
    const candidates = (payload.results ?? [])
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map((value) => ({
        canonicalUrl: bounded(value.url, 4_000),
        title: bounded(value.title, 500) || 'Untitled source',
        snippet: bounded(value.content, 2_000),
        relevanceScore: typeof value.score === 'number' ? value.score : undefined,
        publishedAt: typeof value.published_date === 'string' ? value.published_date : undefined,
      }))
      .filter((candidate) => candidate.canonicalUrl.startsWith('http'));
    return {
      provider: 'tavily',
      searchedAt: new Date().toISOString(),
      providerRequestId: payload.request_id,
      latencyMs: Math.max(0, Date.now() - started),
      creditsUsed: payload.usage?.credits,
      candidates,
    };
  },
  async open(input: WebOpenInput, apiKey: string): Promise<WebOpenedSource> {
    const started = Date.now();
    const response = await request(
      '/extract',
      {
        api_key: apiKey,
        urls: [input.url],
        query: input.query,
        extract_depth: 'basic',
        format: 'markdown',
        chunks_per_source: 1,
        include_images: false,
        include_favicon: false,
      },
      input.timeoutMs,
      'extract',
      input.auditCorrelationId,
    );
    const payload = (await response.json()) as { results?: Array<Record<string, unknown>>; request_id?: string; usage?: { credits?: number } };
    const result = payload.results?.[0];
    const content = bounded(result?.raw_content ?? result?.content, input.maxChars);
    if (!content) throw new Error('WEB_RESEARCH_EMPTY_SOURCE');
    const canonicalUrl = bounded(result?.url, 4_000) || input.url;
    return {
      provider: 'tavily',
      canonicalUrl,
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
      extractedAt: new Date().toISOString(),
      providerRequestId: payload.request_id,
      latencyMs: Math.max(0, Date.now() - started),
      creditsUsed: payload.usage?.credits,
    };
  },
};
