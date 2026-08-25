import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getWebResearchConnector } from './registry';
import { getEffectiveWebResearchSettings } from './settings';

export type WebResearchConnectionTestResult = {
  ok: boolean;
  status: 'succeeded' | 'failed' | 'rate_limited' | 'timed_out';
  provider: 'tavily' | null;
  latencyMs: number;
  providerRequestId?: string;
  creditsUsed?: number;
  candidateCount?: number;
  testedAt: string;
  errorCode?: string;
  errorMessage?: string;
};

function failure(
  startedAt: number,
  provider: 'tavily' | null,
  status: WebResearchConnectionTestResult['status'],
  errorCode: string,
  errorMessage: string,
): WebResearchConnectionTestResult {
  return {
    ok: false,
    status,
    provider,
    latencyMs: Date.now() - startedAt,
    testedAt: new Date().toISOString(),
    errorCode,
    errorMessage,
  };
}

export async function executeWebResearchConnectionTest(): Promise<WebResearchConnectionTestResult> {
  const startedAt = Date.now();
  let provider: 'tavily' | null = null;

  let settings: Awaited<ReturnType<typeof getEffectiveWebResearchSettings>>;
  try {
    settings = await getEffectiveWebResearchSettings();
  } catch {
    return failure(
      startedAt,
      provider,
      'failed',
      'WEB_RESEARCH_UNAVAILABLE',
      'External web research credentials are invalid. Save a new API key before testing it.',
    );
  }

  provider = settings.provider;
  const connector = getWebResearchConnector(settings.provider);
  if (!settings.enabled || !settings.apiKey || !connector) {
    return failure(
      startedAt,
      provider,
      'failed',
      'WEB_RESEARCH_UNAVAILABLE',
      'External web research is not configured. Save a provider and API key before testing it.',
    );
  }

  try {
    const result = await connector.search(
      {
        query: 'next wiki web research connection test',
        maxResults: 1,
        allowedDomains: settings.allowedDomains,
        blockedDomains: settings.blockedDomains,
        timeoutMs: settings.timeoutMs,
        auditOperation: 'connection_test',
        auditCorrelationId: randomUUID(),
      },
      settings.apiKey,
    );
    return {
      ok: true,
      status: 'succeeded',
      provider: connector.id,
      latencyMs: result.latencyMs ?? Date.now() - startedAt,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(result.creditsUsed === undefined ? {} : { creditsUsed: result.creditsUsed }),
      candidateCount: result.candidates.length,
      testedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'WEB_RESEARCH_RATE_LIMITED') {
      return failure(
        startedAt,
        provider,
        'rate_limited',
        'RATE_LIMITED',
        'The web research provider rate-limited the connection test. Try again later.',
      );
    }
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return failure(
        startedAt,
        provider,
        'timed_out',
        'TIMEOUT',
        'The web research provider did not respond before the configured timeout.',
      );
    }
    return failure(
      startedAt,
      provider,
      'failed',
      'PROVIDER_UNAVAILABLE',
      'The web research provider could not be reached or rejected the credentials.',
    );
  }
}

export async function persistWebResearchConnectionTest(result: WebResearchConnectionTestResult): Promise<void> {
  await db
    .update(schema.aiSettings)
    .set({
      webResearchLastTestAt: new Date(result.testedAt),
      webResearchLastTestStatus: result.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiSettings.id, 'default'));
}

export async function recordWebResearchConnectionAttempt(
  actionId: string,
  result: WebResearchConnectionTestResult,
): Promise<void> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { actorUserId: true },
  });
  await db.insert(schema.aiWebResearchAttempts).values({
    aiActionId: actionId,
    actorUserId: action?.actorUserId ?? null,
    provider: 'tavily',
    kind: 'connection_test',
    outcome: result.status,
    policyDisposition: 'admin_test',
    providerRequestId: result.providerRequestId ?? null,
    latencyMs: result.latencyMs,
    creditsUsed: result.creditsUsed ?? null,
  });
}
