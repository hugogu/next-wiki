import { and, count, eq, gt } from 'drizzle-orm';
import { decryptAiJson, encryptAiJson } from '@/server/crypto/ai-encryption';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { requireWebResearchConfiguration } from './policy';
import { isAllowedWebUrl } from './url-policy';

const SOURCE_TTL_MS = 24 * 60 * 60 * 1000;

function expiry() {
  return new Date(Date.now() + SOURCE_TTL_MS);
}

function providerFailureOutcome(error: unknown): 'timed_out' | 'rate_limited' | 'failed' {
  if (error instanceof Error && error.message === 'WEB_RESEARCH_RATE_LIMITED') return 'rate_limited';
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timed_out';
  return 'failed';
}

async function assertActionMayCallProvider(actionId: string, kind: 'search' | 'open', limit: number): Promise<void> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { cancelRequested: true, status: true },
  });
  if (!action || action.cancelRequested || action.status === 'cancelled') {
    await recordAttempt({ actionId, kind, outcome: 'cancelled', policyDisposition: 'action_cancelled' });
    throw new DomainError('CANCELLED', 'The web research request was cancelled');
  }
  const [row] = await db
    .select({ value: count() })
    .from(schema.aiWebResearchAttempts)
    .where(and(
      eq(schema.aiWebResearchAttempts.aiActionId, actionId),
      eq(schema.aiWebResearchAttempts.kind, kind),
      eq(schema.aiWebResearchAttempts.outcome, 'succeeded'),
    ));
  if ((row?.value ?? 0) >= limit) {
    await recordAttempt({ actionId, kind, outcome: 'denied', policyDisposition: 'turn_limit' });
    throw new DomainError('AI_FEATURE_DISABLED', `Web research ${kind} limit reached for this answer`);
  }
}

async function recordAttempt(input: {
  actionId: string;
  kind: 'search' | 'open' | 'connection_test' | 'capture';
  outcome: 'succeeded' | 'denied' | 'blocked' | 'cancelled' | 'timed_out' | 'rate_limited' | 'failed';
  policyDisposition: string;
  searchCount?: number;
  openCount?: number;
  sourceChars?: number;
  providerRequestId?: string;
  latencyMs?: number;
  creditsUsed?: number;
}) {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, input.actionId),
    columns: { actorUserId: true },
  });
  await db.insert(schema.aiWebResearchAttempts).values({
    aiActionId: input.actionId,
    actorUserId: action?.actorUserId ?? null,
    provider: 'tavily',
    kind: input.kind,
    outcome: input.outcome,
    policyDisposition: input.policyDisposition,
    searchCount: input.searchCount ?? 0,
    openCount: input.openCount ?? 0,
    sourceChars: input.sourceChars ?? 0,
    providerRequestId: input.providerRequestId ?? null,
    latencyMs: input.latencyMs ?? null,
    creditsUsed: input.creditsUsed ?? null,
  });
}

export async function searchWebSources(input: { actionId: string; query: string }) {
  const { settings, connector, apiKey } = await requireWebResearchConfiguration();
  await assertActionMayCallProvider(input.actionId, 'search', settings.maxSearchesPerTurn);
  let result;
  try {
    result = await connector.search(
      {
        query: input.query.slice(0, 400),
        maxResults: settings.maxCandidatesPerSearch,
        allowedDomains: settings.allowedDomains,
        blockedDomains: settings.blockedDomains,
        timeoutMs: settings.timeoutMs,
        auditCorrelationId: input.actionId,
      },
      apiKey,
    );
  } catch (error) {
    await recordAttempt({
      actionId: input.actionId,
      kind: 'search',
      outcome: providerFailureOutcome(error),
      policyDisposition: 'provider_error',
    });
    throw error;
  }
  const candidates = result.candidates.filter((candidate) =>
    isAllowedWebUrl(candidate.canonicalUrl, settings.allowedDomains, settings.blockedDomains),
  );
  const rows = await db.transaction(async (tx) => {
    const stored = [];
    for (const candidate of candidates) {
      const [row] = await tx
        .insert(schema.aiWebSources)
        .values({
          aiActionId: input.actionId,
          provider: 'tavily',
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          snippet: candidate.snippet,
          relevanceScore:
            candidate.relevanceScore === undefined ? null : Math.round(candidate.relevanceScore * 10_000),
          publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
          providerRequestId: result.providerRequestId ?? null,
          expiresAt: expiry(),
        })
        .onConflictDoUpdate({
          target: [schema.aiWebSources.aiActionId, schema.aiWebSources.canonicalUrl],
          set: { title: candidate.title, snippet: candidate.snippet, updatedAt: new Date() },
        })
        .returning();
      if (row) stored.push(row);
    }
    return stored;
  });
  await recordAttempt({
    actionId: input.actionId,
    kind: 'search',
    outcome: 'succeeded',
    policyDisposition: 'allowed',
    searchCount: 1,
    providerRequestId: result.providerRequestId,
    latencyMs: result.latencyMs,
    creditsUsed: result.creditsUsed,
  });
  return rows.map((row) => ({
    sourceId: row.id,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    snippet: row.snippet ?? '',
    publishedAt: row.publishedAt?.toISOString(),
  }));
}

export async function openWebSource(input: {
  actionId: string;
  sourceId: string;
  query: string;
  toolCallId?: string;
}) {
  const source = await db.query.aiWebSources.findFirst({
    where: and(
      eq(schema.aiWebSources.id, input.sourceId),
      eq(schema.aiWebSources.aiActionId, input.actionId),
      gt(schema.aiWebSources.expiresAt, new Date()),
    ),
  });
  if (!source) throw new DomainError('NOT_FOUND', 'The requested web source is no longer available');
  const { settings, connector, apiKey } = await requireWebResearchConfiguration();
  await assertActionMayCallProvider(input.actionId, 'open', settings.maxOpenedSourcesPerTurn);
  if (!isAllowedWebUrl(source.canonicalUrl, settings.allowedDomains, settings.blockedDomains)) {
    await recordAttempt({ actionId: input.actionId, kind: 'open', outcome: 'blocked', policyDisposition: 'domain_blocked' });
    throw new DomainError('FORBIDDEN', 'The requested web source is blocked by policy');
  }
  let opened;
  try {
    opened = await connector.open(
      {
        url: source.canonicalUrl,
        query: input.query.slice(0, 400),
        timeoutMs: settings.timeoutMs,
        maxChars: settings.maxSourceChars,
        auditCorrelationId: input.actionId,
      },
      apiKey,
    );
  } catch (error) {
    await recordAttempt({
      actionId: input.actionId,
      kind: 'open',
      outcome: providerFailureOutcome(error),
      policyDisposition: 'provider_error',
    });
    throw error;
  }
  if (!isAllowedWebUrl(opened.canonicalUrl, settings.allowedDomains, settings.blockedDomains)) {
    await recordAttempt({ actionId: input.actionId, kind: 'open', outcome: 'blocked', policyDisposition: 'redirect_blocked' });
    throw new DomainError('FORBIDDEN', 'The source redirected outside the allowed policy');
  }
  const [updated] = await db
    .update(schema.aiWebSources)
    .set({
      originatingToolCallId: input.toolCallId ?? source.originatingToolCallId,
      canonicalUrl: opened.canonicalUrl,
      contentEncrypted: encryptAiJson(opened.content),
      contentHash: opened.contentHash,
      status: 'opened',
      providerRequestId: opened.providerRequestId ?? source.providerRequestId,
      failureCode: null,
      retrievedAt: new Date(opened.extractedAt),
      updatedAt: new Date(),
    })
    .where(eq(schema.aiWebSources.id, source.id))
    .returning();
  await recordAttempt({
    actionId: input.actionId,
    kind: 'open',
    outcome: 'succeeded',
    policyDisposition: 'allowed',
    openCount: 1,
    sourceChars: opened.content.length,
    providerRequestId: opened.providerRequestId,
    latencyMs: opened.latencyMs,
    creditsUsed: opened.creditsUsed,
  });
  return {
    sourceId: updated!.id,
    title: updated!.title,
    canonicalUrl: updated!.canonicalUrl,
    provider: updated!.provider,
    retrievedAt: updated!.retrievedAt.toISOString(),
    content: opened.content,
    contentHash: opened.contentHash,
  };
}

export async function readOpenedWebSource(actionId: string, sourceId: string) {
  const source = await db.query.aiWebSources.findFirst({
    where: and(
      eq(schema.aiWebSources.id, sourceId),
      eq(schema.aiWebSources.aiActionId, actionId),
      eq(schema.aiWebSources.status, 'opened'),
      gt(schema.aiWebSources.expiresAt, new Date()),
    ),
  });
  if (!source?.contentEncrypted) throw new DomainError('NOT_FOUND', 'The requested web source is no longer available');
  return { source, content: decryptAiJson<string>(source.contentEncrypted) };
}
