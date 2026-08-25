export const WEB_RESEARCH_PROVIDER = 'tavily' as const;

export type WebResearchCandidate = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
  publishedAt?: string;
};

export type WebSearchInput = {
  query: string;
  maxResults: number;
  allowedDomains: string[];
  blockedDomains: string[];
  timeoutMs: number;
  auditOperation?: 'search' | 'connection_test';
  auditCorrelationId?: string;
};

export type WebSearchResult = {
  provider: typeof WEB_RESEARCH_PROVIDER;
  searchedAt: string;
  providerRequestId?: string;
  latencyMs?: number;
  creditsUsed?: number;
  candidates: Omit<WebResearchCandidate, 'sourceId'>[];
};

export type WebOpenInput = {
  url: string;
  query: string;
  timeoutMs: number;
  maxChars: number;
  auditCorrelationId?: string;
};

export type WebOpenedSource = {
  provider: typeof WEB_RESEARCH_PROVIDER;
  canonicalUrl: string;
  content: string;
  contentHash: string;
  extractedAt: string;
  providerRequestId?: string;
  latencyMs?: number;
  creditsUsed?: number;
};

export type WebResearchConnector = {
  id: typeof WEB_RESEARCH_PROVIDER;
  displayName: string;
  search(input: WebSearchInput, apiKey: string): Promise<WebSearchResult>;
  open(input: WebOpenInput, apiKey: string): Promise<WebOpenedSource>;
};

export type EffectiveWebResearchSettings = {
  enabled: boolean;
  provider: typeof WEB_RESEARCH_PROVIDER | null;
  apiKey: string | null;
  allowedDomains: string[];
  blockedDomains: string[];
  maxSearchesPerTurn: number;
  maxCandidatesPerSearch: number;
  maxOpenedSourcesPerTurn: number;
  maxSourceChars: number;
  timeoutMs: number;
};
