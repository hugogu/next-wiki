import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEffectiveSettings: vi.fn(),
  getConnector: vi.fn(),
}));

vi.mock('./settings', () => ({ getEffectiveWebResearchSettings: mocks.getEffectiveSettings }));
vi.mock('./registry', () => ({ getWebResearchConnector: mocks.getConnector }));

const { executeWebResearchConnectionTest } = await import('./connection-test');

describe('web research connection test', () => {
  it('returns synchronous provider health details without exposing credentials', async () => {
    mocks.getEffectiveSettings.mockResolvedValue({
      enabled: true,
      provider: 'tavily',
      apiKey: 'secret-key',
      allowedDomains: [],
      blockedDomains: [],
      maxSearchesPerTurn: 2,
      maxCandidatesPerSearch: 5,
      maxOpenedSourcesPerTurn: 3,
      maxSourceChars: 16_000,
      timeoutMs: 10_000,
    });
    mocks.getConnector.mockReturnValue({
      id: 'tavily',
      search: vi.fn().mockResolvedValue({
        providerRequestId: 'req-1',
        latencyMs: 42,
        creditsUsed: 1,
        candidates: [{ canonicalUrl: 'https://example.com', title: 'Example', snippet: 'result' }],
      }),
    });

    const result = await executeWebResearchConnectionTest();

    expect(result).toMatchObject({
      ok: true,
      status: 'succeeded',
      provider: 'tavily',
      latencyMs: 42,
      providerRequestId: 'req-1',
      creditsUsed: 1,
      candidateCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('returns a typed unavailable result when credentials cannot be decrypted', async () => {
    mocks.getEffectiveSettings.mockRejectedValue(new Error('decrypt failed: secret-key'));

    const result = await executeWebResearchConnectionTest();

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      errorCode: 'WEB_RESEARCH_UNAVAILABLE',
    });
    expect(result.errorMessage).not.toContain('secret-key');
  });
});
