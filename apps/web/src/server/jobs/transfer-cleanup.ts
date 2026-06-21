import { and, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { transferArtifactStore } from '@/server/transfers/artifact-store';

export async function runTransferCleanup(now = new Date()): Promise<void> {
  const artifacts = await db
    .select()
    .from(schema.transferArtifacts)
    .where(
      and(
        lt(schema.transferArtifacts.expiresAt, now),
        inArray(schema.transferArtifacts.status, ['ready', 'uploading', 'failed', 'expired']),
      ),
    );
  for (const artifact of artifacts) {
    const active = await db.query.transferRuns.findFirst({
      where: and(
        or(
          eq(schema.transferRuns.sourceArtifactId, artifact.id),
          eq(schema.transferRuns.reportArtifactId, artifact.id),
        ),
        inArray(schema.transferRuns.status, ['queued', 'running']),
      ),
    });
    if (active) continue;
    await transferArtifactStore.delete(artifact.storageKey).catch(() => undefined);
    await db
      .update(schema.transferArtifacts)
      .set({ status: 'deleted', deletedAt: new Date() })
      .where(eq(schema.transferArtifacts.id, artifact.id));
  }
}
