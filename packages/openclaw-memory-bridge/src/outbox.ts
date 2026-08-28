import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type OutboxState = 'pending' | 'in_flight' | 'acknowledged' | 'retryable' | 'terminal_failed';

export type OutboxEntry<T = unknown> = {
  id: string;
  state: OutboxState;
  payload: T;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastErrorCode?: string;
};

type Stored<T> = { entries: Array<OutboxEntry<T>> };

export class FileOutbox<T = unknown> {
  private readonly filePath: string;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly maxAgeSeconds: number;
  private entries: Array<OutboxEntry<T>> = [];

  constructor(stateDir: string, options: { maxEntries: number; maxBytes: number; maxAgeSeconds?: number }) {
    this.filePath = join(stateDir, 'next-wiki-memory-bridge', 'outbox.json');
    this.maxEntries = options.maxEntries;
    this.maxBytes = options.maxBytes;
    this.maxAgeSeconds = options.maxAgeSeconds ?? 604_800;
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      const content = await readFile(this.filePath, 'utf8');
      const stored = JSON.parse(content) as Stored<T>;
      this.entries = Array.isArray(stored.entries) ? stored.entries : [];
    } catch {
      this.entries = [];
    }
    await chmod(this.filePath, 0o600).catch(() => undefined);
    const cutoff = Date.now() - this.maxAgeSeconds * 1_000;
    this.entries = this.entries.filter((entry) => new Date(entry.createdAt).getTime() >= cutoff);
    for (const entry of this.entries) {
      if (entry.state === 'in_flight') entry.state = 'retryable';
    }
    await this.persist();
  }

  async enqueue(id: string, payload: T): Promise<OutboxEntry<T>> {
    const existing = this.entries.find((entry) => entry.id === id);
    if (existing) return existing;
    const projected = Buffer.byteLength(JSON.stringify({ entries: [...this.entries, { id, payload }] }));
    if (this.entries.length >= this.maxEntries || projected > this.maxBytes) {
      throw new Error('outbox_capacity_exceeded');
    }
    const now = new Date().toISOString();
    const entry: OutboxEntry<T> = { id, state: 'pending', payload, attempts: 0, createdAt: now, updatedAt: now, nextAttemptAt: now };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  list(): ReadonlyArray<OutboxEntry<T>> {
    return this.entries;
  }

  async claim(now = new Date()): Promise<OutboxEntry<T> | null> {
    const entry = this.entries.find((candidate) => ['pending', 'retryable'].includes(candidate.state) && new Date(candidate.nextAttemptAt) <= now);
    if (!entry) return null;
    entry.state = 'in_flight';
    entry.attempts += 1;
    entry.updatedAt = now.toISOString();
    await this.persist();
    return entry;
  }

  async acknowledge(id: string): Promise<void> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    entry.state = 'acknowledged';
    entry.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async fail(id: string, code: string, terminal = false): Promise<void> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    entry.state = terminal ? 'terminal_failed' : 'retryable';
    entry.lastErrorCode = code;
    entry.updatedAt = new Date().toISOString();
    entry.nextAttemptAt = new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** Math.min(entry.attempts, 8)) + Math.floor(Math.random() * 500)).toISOString();
    await this.persist();
  }

  private async persist(): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify({ entries: this.entries }), { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.filePath);
  }
}
