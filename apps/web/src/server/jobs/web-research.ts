import { eq } from 'drizzle-orm';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { finishAction } from '@/server/services/ai-actions';
import { getWebResearchConnector } from '@/server/web-research/registry';
import { getEffectiveWebResearchSettings } from '@/server/web-research/settings';

async function recordConnectionTestAttempt(
  actionId: string,
  outcome: 'succeeded' | 'failed' | 'rate_limited' | 'timed_out',
  latencyMs?: number,
  creditsUsed?: number,
) {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { actorUserId: true },
  });
  await db.insert(schema.aiWebResearchAttempts).values({
    aiActionId: actionId,
    actorUserId: action?.actorUserId ?? null,
    provider: 'tavily',
    kind: 'connection_test',
    outcome,
    policyDisposition: 'admin_test',
    latencyMs: latencyMs ?? null,
    creditsUsed: creditsUsed ?? null,
  });
}

export async function runWebResearchTestAction(actionId: string): Promise<void> {
  await runWithoutDataCache(() => runWebResearchTestActionWithoutDataCache(actionId));
}

async function runWebResearchTestActionWithoutDataCache(actionId: string): Promise<void> {
  const settings = await getEffectiveWebResearchSettings();
  const connector = settings.provider ? getWebResearchConnector(settings.provider) : null;
  try {
    if (!connector || !settings.apiKey) throw new Error('Web research connector is not configured');
    const result = await connector.search(
      {
        query: 'next wiki web research connection test',
        maxResults: 1,
        allowedDomains: settings.allowedDomains,
        blockedDomains: settings.blockedDomains,
        timeoutMs: settings.timeoutMs,
        auditOperation: 'connection_test',
        auditCorrelationId: actionId,
      },
      settings.apiKey,
    );
    await db.update(schema.aiSettings).set({
      webResearchLastTestAt: new Date(),
      webResearchLastTestStatus: 'succeeded',
      updatedAt: new Date(),
    }).where(eq(schema.aiSettings.id, 'default'));
    await recordConnectionTestAttempt(actionId, 'succeeded', result.latencyMs, result.creditsUsed);
    await finishAction(actionId, 'completed', {
      resultMetadata: { provider: connector.id, candidateCount: result.candidates.length },
      usageMetadata: { latencyMs: result.latencyMs, creditsUsed: result.creditsUsed },
    });
  } catch (error) {
    await db.update(schema.aiSettings).set({
      webResearchLastTestAt: new Date(),
      webResearchLastTestStatus: 'failed',
      updatedAt: new Date(),
    }).where(eq(schema.aiSettings.id, 'default'));
    await recordConnectionTestAttempt(
      actionId,
      error instanceof Error && error.message === 'WEB_RESEARCH_RATE_LIMITED'
        ? 'rate_limited'
        : error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
          ? 'timed_out'
          : 'failed',
    );
    throw error;
  }
}
