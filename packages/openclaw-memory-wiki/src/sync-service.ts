import { createHash } from 'node:crypto';
import { lstat, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { scanVault, DEFAULT_MAX_FILE_BYTES, type VaultDocument } from './vault-scanner.js';
import { NextWikiClient } from './client.js';

const JOURNAL_VERSION = 2;
type Journal = { version: number; completed: Record<string, string>; lastRunAt?: string; lastError?: string };
export type SyncStatus = { state: 'idle' | 'running' | 'degraded'; scanned: number; uploaded: number; unchanged: number; failed: number; skipped: number; lastRunAt?: string; lastError?: string };

type SyncSource = { path: string; prefix: string; optional: boolean; kind: 'directory' | 'file'; sourcePath?: string };

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}

export class SyncService {
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private status: SyncStatus = { state: 'idle', scanned: 0, uploaded: 0, unchanged: 0, failed: 0, skipped: 0 };
  private readonly sources: SyncSource[];
  constructor(private readonly vaultPath: string, private readonly client: NextWikiClient, private readonly intervalMinutes: number, memoryPath?: string, workspacePath?: string) {
    this.sources = [{ path: vaultPath, prefix: '', optional: false, kind: 'directory' }];
    if (workspacePath) {
      this.sources.push({ path: join(workspacePath, 'MEMORY.md'), prefix: 'memory-core/', optional: true, kind: 'file', sourcePath: 'MEMORY.md' });
    }
    if (memoryPath && resolve(memoryPath) !== resolve(vaultPath)) {
      this.sources.push({ path: memoryPath, prefix: 'memory-core/memory/', optional: true, kind: 'directory' });
    }
  }
  private journalPath() { return join(this.vaultPath, '..', '.openclaw-wiki-next-wiki-sync.json'); }
  private async readJournal(): Promise<Journal> {
    try {
      const parsed = JSON.parse(await readFile(this.journalPath(), 'utf8')) as Partial<Journal>;
      if (!parsed || typeof parsed !== 'object' || !parsed.completed || typeof parsed.completed !== 'object') throw new Error('invalid_journal');
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        completed: parsed.completed as Record<string, string>,
        lastRunAt: parsed.lastRunAt,
        lastError: parsed.lastError,
      };
    } catch {
      return { version: JOURNAL_VERSION, completed: {} };
    }
  }
  private async writeJournal(journal: Journal): Promise<void> { const temp = `${this.journalPath()}.tmp`; await writeFile(temp, JSON.stringify(journal), { mode: 0o600 }); await rename(temp, this.journalPath()); }
  private async scanSource(source: SyncSource, onSkip: (sourcePath: string, reason: 'too_large' | 'changed_during_scan' | 'unreadable') => void): Promise<VaultDocument[]> {
    try {
      if (source.kind === 'file') {
        const stat = await lstat(source.path);
        if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the OpenClaw memory workspace: ${source.sourcePath ?? source.path}`);
        if (!stat.isFile()) return [];
        const sourcePath = `${source.prefix}${source.sourcePath ?? basename(source.path)}`;
        if (stat.size > DEFAULT_MAX_FILE_BYTES) {
          onSkip(sourcePath, 'too_large');
          return [];
        }
        const content = await readFile(source.path, 'utf8');
        const after = await lstat(source.path);
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
          onSkip(sourcePath, 'changed_during_scan');
          return [];
        }
        return [{ sourcePath, content, sourceDigest: createHash('sha256').update(content, 'utf8').digest('hex'), sizeBytes: stat.size }];
      }
      const documents = await scanVault(source.path, DEFAULT_MAX_FILE_BYTES, (sourcePath, reason) => onSkip(`${source.prefix}${sourcePath}`, reason));
      if (!source.prefix) return documents;
      return documents.map((document) => ({ ...document, sourcePath: `${source.prefix}${document.sourcePath}` }));
    } catch (error) {
      // OpenClaw does not create memory/ until the first memory write. A
      // missing memory-core root is therefore a valid empty corpus, not a
      // degraded plugin run; an existing but unreadable root still fails loud.
      if (source.optional && isMissingPath(error)) return [];
      throw error;
    }
  }

  async run(): Promise<SyncStatus> {
    if (this.running) return this.status;
    this.running = true;
    this.status = { ...this.status, state: 'running', failed: 0, skipped: 0 };
    try {
      let skipped = 0;
      const [documents, journal] = await Promise.all([
        Promise.all(this.sources.map((source) => this.scanSource(source, (sourcePath, reason) => {
          skipped++;
          console.warn(`[next-wiki-memory-wiki] skipped ${sourcePath}: ${reason}`);
        }))).then((groups) => groups.flat()),
        this.readJournal(),
      ]);
      const needsMirrorMigration = journal.version !== JOURNAL_VERSION;
      let uploaded = 0; let unchanged = 0; let failed = 0;
      for (const document of documents) {
        try {
          if (!needsMirrorMigration && journal.completed[document.sourcePath] === document.sourceDigest) {
            unchanged++;
            continue;
          }
          const result = await this.withRetry(() => this.client.mirror({ sourcePath: document.sourcePath, content: document.content, sourceDigest: document.sourceDigest, idempotencyKey: `${document.sourcePath}:${document.sourceDigest}` }));
          journal.completed[document.sourcePath] = document.sourceDigest;
          if (result.outcome === 'unchanged') unchanged++; else uploaded++;
        } catch (error) {
          failed++;
          if (needsMirrorMigration) delete journal.completed[document.sourcePath];
          journal.lastError = error instanceof Error ? error.message : 'sync_failed';
        }
      }
      journal.lastRunAt = new Date().toISOString();
      // Mark the layout migration complete even when individual documents
      // failed. Successful documents are checkpointed above, so a later run
      // can retry only the failed or missing entries instead of replaying the
      // entire vault on every degraded run.
      journal.version = JOURNAL_VERSION;
      if (failed === 0) delete journal.lastError;
      await this.writeJournal(journal);
      console.log(`[next-wiki-memory-wiki] sync complete: scanned=${documents.length} uploaded=${uploaded} unchanged=${unchanged} failed=${failed} skipped=${skipped}`);
      this.status = { state: failed > 0 ? 'degraded' : 'idle', scanned: documents.length, uploaded, unchanged, failed, skipped, lastRunAt: journal.lastRunAt, lastError: journal.lastError };
      return this.status;
    } catch (error) {
      console.error('[next-wiki-memory-wiki] sync run failed:', error);
      this.status = { ...this.status, state: 'degraded', failed: Math.max(1, this.status.failed), lastError: 'vault_scan_failed' };
      return this.status;
    } finally { this.running = false; }
  }
  private startRun(): void {
    void this.run().catch((error) => {
      console.error('[next-wiki-memory-wiki] sync run failed:', error);
      this.status = { ...this.status, state: 'degraded', failed: Math.max(1, this.status.failed), lastError: 'sync_failed' };
    });
  }
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) { try { return await operation(); } catch (error) { last = error; if (!(error as { retryable?: boolean }).retryable) throw error; await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, 250 * 2 ** attempt) + Math.random() * 150)); } }
    throw last;
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.startRun(), this.intervalMinutes * 60_000); this.startRun(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  getStatus(): SyncStatus { return { ...this.status }; }
}

export type { VaultDocument };
