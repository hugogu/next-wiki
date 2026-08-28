export { discoverSources } from './source-discovery';
export { buildPreview } from './preview';
export { ImportLedger } from './ledger';
export { runImport, importIdempotencyKey } from './import-runner';
export { parseMigrateConfig, migrateConfigSchema } from './config';
export { MigrationApiClient } from './api-client';

import { buildPreview } from './preview';
import { ledgerEncryptionKeyValue, parseMigrateConfig } from './config';
import { discoverSources } from './source-discovery';
import { ImportLedger } from './ledger';
import { importIdempotencyKey, runImport } from './import-runner';
import { MigrationApiClient } from './api-client';

type MigrationPluginApi = {
  config?: unknown;
  registerTool?: (name: string, handler: (input: Record<string, unknown>) => Promise<unknown>, options?: Record<string, unknown>) => void;
};

export function definePluginEntry<T>(entry: T): T { return entry; }

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`migration_${key}_required`);
  return value;
}

const entry = definePluginEntry((api: MigrationPluginApi) => {
  const config = parseMigrateConfig(api.config ?? {});
  const client = new MigrationApiClient(config);
  api.registerTool?.('next_wiki_memory_migrate_preview', async (input) => {
    const candidates = await discoverSources(requireString(input, 'root'));
    return buildPreview(candidates);
  }, { optional: true });
  api.registerTool?.('next_wiki_memory_migrate_run', async (input) => {
    const root = requireString(input, 'root');
    const ledgerPath = requireString(input, 'ledgerPath');
    const runId = requireString(input, 'runId');
    const approve = input.approve === true;
    const candidates = await discoverSources(root);
    const ledger = await ImportLedger.load(ledgerPath, runId, candidates.map((candidate) => ({
      fingerprint: candidate.sourceFingerprint,
      idempotencyKey: importIdempotencyKey(candidate),
      status: 'pending' as const,
    })), ledgerEncryptionKeyValue(config.ledgerEncryptionKey));
    await runImport(ledger, candidates, client, approve);
    return { status: ledger.snapshot.state, imported: ledger.snapshot.items.filter((item) => item.status === 'completed').length };
  }, { optional: true });
  return { client };
});

export default entry;
