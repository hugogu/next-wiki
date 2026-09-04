import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scanVault, type VaultDocument } from './vault-scanner.js';
import { NextWikiClient } from './client.js';

type Journal = { completed: Record<string, string>; lastRunAt?: string; lastError?: string };
export type SyncStatus = { state: 'idle' | 'running' | 'degraded'; scanned: number; uploaded: number; unchanged: number; failed: number; skipped: number; lastRunAt?: string; lastError?: string };

export class SyncService {
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private status: SyncStatus = { state: 'idle', scanned: 0, uploaded: 0, unchanged: 0, failed: 0, skipped: 0 };
  constructor(private readonly vaultPath: string, private readonly client: NextWikiClient, private readonly intervalMinutes: number) {}
  private journalPath() { return join(this.vaultPath, '..', '.openclaw-wiki-next-wiki-sync.json'); }
  private async readJournal(): Promise<Journal> {
    try {
      const parsed = JSON.parse(await readFile(this.journalPath(), 'utf8')) as Partial<Journal>;
      if (!parsed || typeof parsed !== 'object' || !parsed.completed || typeof parsed.completed !== 'object') throw new Error('invalid_journal');
      return { completed: parsed.completed as Record<string, string>, lastRunAt: parsed.lastRunAt, lastError: parsed.lastError };
    } catch {
      return { completed: {} };
    }
  }
  private async writeJournal(journal: Journal): Promise<void> { const temp = `${this.journalPath()}.tmp`; await writeFile(temp, JSON.stringify(journal), { mode: 0o600 }); await rename(temp, this.journalPath()); }

  async run(): Promise<SyncStatus> {
    if (this.running) return this.status;
    this.running = true;
    this.status = { ...this.status, state: 'running', failed: 0, skipped: 0 };
    try {
      let skipped = 0;
      const [documents, journal] = await Promise.all([
        scanVault(this.vaultPath, 512_000, (sourcePath, reason) => {
          skipped++;
          console.error(`[next-wiki-memory-wiki] skipped ${sourcePath}: ${reason}`);
        }),
        this.readJournal(),
      ]);
      let uploaded = 0; let unchanged = 0; let failed = 0;
      for (const document of documents) {
        try {
          if (journal.completed[document.sourcePath] === document.sourceDigest) {
            unchanged++;
            continue;
          }
          const result = await this.withRetry(() => this.client.mirror({ sourcePath: document.sourcePath, content: document.content, sourceDigest: document.sourceDigest, idempotencyKey: `${document.sourcePath}:${document.sourceDigest}` }));
          journal.completed[document.sourcePath] = document.sourceDigest;
          if (result.outcome === 'unchanged') unchanged++; else uploaded++;
        } catch (error) {
          failed++; journal.lastError = error instanceof Error ? error.message : 'sync_failed';
        }
      }
      journal.lastRunAt = new Date().toISOString();
      if (failed === 0) delete journal.lastError;
      await this.writeJournal(journal);
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
