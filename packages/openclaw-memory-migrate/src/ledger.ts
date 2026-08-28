import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type LedgerState = 'preview' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled';
export type LedgerItem = { fingerprint: string; idempotencyKey: string; status: 'pending' | 'completed' | 'failed' };
export type Ledger = { runId: string; state: LedgerState; items: LedgerItem[] };

const ALLOWED_TRANSITIONS: Record<LedgerState, readonly LedgerState[]> = {
  preview: ['approved', 'cancelled'],
  approved: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  failed: ['approved', 'cancelled'],
  cancelled: ['approved'],
  completed: [],
};

function keyForSecret(secret: string): Buffer {
  if (!secret.trim()) throw new Error('ledger_encryption_key_required');
  return createHash('sha256').update('next-wiki-memory-migrate-ledger:v1\0').update(secret).digest();
}

function seal(value: Ledger, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyForSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') });
}

function open(value: string, secret: string): Ledger {
  const envelope = JSON.parse(value) as { iv: string; tag: string; ciphertext: string };
  const decipher = createDecipheriv('aes-256-gcm', keyForSecret(secret), Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as Ledger;
}

export class ImportLedger {
  private value: Ledger;
  constructor(private readonly filePath: string, runId: string, items: LedgerItem[], private readonly encryptionKey: string) {
    this.value = { runId, state: 'preview', items };
  }
  static async load(filePath: string, runId: string, items: LedgerItem[], encryptionKey: string): Promise<ImportLedger> {
    const ledger = new ImportLedger(filePath, runId, items, encryptionKey);
    let content: string;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      await ledger.persist();
      return ledger;
    }
    let loaded: Ledger;
    try {
      loaded = open(content, encryptionKey);
    } catch {
      throw new Error('ledger_unreadable');
    }
    if (loaded.runId !== runId) throw new Error('ledger_run_mismatch');
    ledger.value = loaded;
    return ledger;
  }
  get snapshot(): Ledger { return structuredClone(this.value); }
  status(fingerprint: string): LedgerItem['status'] | undefined {
    return this.value.items.find((item) => item.fingerprint === fingerprint)?.status;
  }
  async setState(state: LedgerState): Promise<void> {
    if (state !== this.value.state && !ALLOWED_TRANSITIONS[this.value.state].includes(state)) {
      throw new Error(`invalid_ledger_transition:${this.value.state}->${state}`);
    }
    this.value.state = state;
    await this.persist();
  }
  async complete(fingerprint: string): Promise<void> {
    const item = this.value.items.find((candidate) => candidate.fingerprint === fingerprint);
    if (item) item.status = 'completed';
    await this.persist();
  }
  async fail(fingerprint: string): Promise<void> {
    const item = this.value.items.find((candidate) => candidate.fingerprint === fingerprint);
    if (item) item.status = 'failed';
    await this.persist();
  }
  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, seal(this.value, this.encryptionKey), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
