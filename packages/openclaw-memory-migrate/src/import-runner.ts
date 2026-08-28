import { createHash } from 'node:crypto';
import type { MigrationCandidate } from './source-discovery';
import { ImportLedger } from './ledger';

type ImportClient = {
  save(input: { idempotencyKey: string; content: string; title: string; origin: 'import'; role: 'evidence' }): Promise<unknown>;
};

export function importIdempotencyKey(candidate: MigrationCandidate): string {
  return `import:${createHash('sha256').update(candidate.sourceFingerprint).digest('hex')}`;
}

export async function runImport(
  ledger: ImportLedger,
  candidates: MigrationCandidate[],
  client: ImportClient,
  approve: boolean,
): Promise<void> {
  if (!approve) throw new Error('migration_approval_required');
  if (ledger.snapshot.state === 'completed') return;
  await ledger.setState('approved');
  await ledger.setState('running');
  for (const candidate of candidates) {
    if (!candidate.eligible) continue;
    if (ledger.status(candidate.sourceFingerprint) === 'completed') continue;
    try {
      await client.save({
        idempotencyKey: importIdempotencyKey(candidate),
        content: candidate.content,
        // Do not forward a local filesystem path as server metadata. The
        // deterministic fingerprint remains the provenance/idempotency handle.
        title: 'Imported memory',
        origin: 'import',
        role: 'evidence',
      });
      await ledger.complete(candidate.sourceFingerprint);
    } catch {
      await ledger.fail(candidate.sourceFingerprint);
      await ledger.setState('failed');
      throw new Error('migration_import_failed');
    }
  }
  await ledger.setState('completed');
}
