import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getRuntimeSource } from '@/server/services/transfer-sources';
import { markRunTerminal } from '@/server/services/transfers';
import { WikiJsClient } from '@/server/transfers/wikijs-client';

export async function runTransferSourceTest(runId: string): Promise<void> {
  const run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
  if (!run?.sourceId) return;
  await db.update(schema.transferRuns).set({
    status: 'running',
    phase: 'discovering',
    startedAt: run.startedAt ?? new Date(),
  }).where(eq(schema.transferRuns.id, runId));
  try {
    const source = await getRuntimeSource(run.sourceId);
    const client = new WikiJsClient(source.baseUrl, source.apiToken, source.allowPrivateNetwork);
    const pages = await client.listPages();
    if (pages[0]) await client.getPage(pages[0].id);
    await db.update(schema.transferSources).set({
      status: 'healthy',
      lastCheckedAt: new Date(),
      lastErrorCode: null,
    }).where(eq(schema.transferSources.id, source.id));
    await markRunTerminal(runId, 'completed', { totalItems: pages.length, processedItems: pages.length });
  } catch {
    await db.update(schema.transferSources).set({
      status: 'unavailable',
      lastCheckedAt: new Date(),
      lastErrorCode: 'SOURCE_UNAVAILABLE',
    }).where(eq(schema.transferSources.id, run.sourceId));
    await markRunTerminal(runId, 'failed', {
      errorCode: 'SOURCE_UNAVAILABLE',
      errorMessage: 'Wiki.js connection test failed',
    });
  }
}
