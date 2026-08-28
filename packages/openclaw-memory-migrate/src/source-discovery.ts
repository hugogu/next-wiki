import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export type MigrationCandidate = {
  relativePath: string;
  sourceFingerprint: string;
  content: string;
  category: 'memory' | 'session' | 'unknown';
  eligible: boolean;
  reason?: string;
};

const MAX_BYTES = 64_000;

export async function discoverSources(root: string): Promise<MigrationCandidate[]> {
  const output: MigrationCandidate[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      // Never follow a symlink supplied by a migration root; it could escape
      // the operator-selected directory and import unrelated private files.
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (extname(entry.name).toLowerCase() !== '.md') continue;
      const relativePath = relative(root, absolute);
      const buffer = await readFile(absolute);
      const digest = createHash('sha256').update(buffer).digest('hex');
      if (buffer.byteLength > MAX_BYTES) {
        output.push({ relativePath, sourceFingerprint: digest, content: '', category: 'unknown', eligible: false, reason: 'oversized' });
        continue;
      }
      const content = buffer.toString('utf8').trim();
      const category = /session|transcript|conversation/i.test(relativePath) ? 'session' : /memory|knowledge/i.test(relativePath) ? 'memory' : 'unknown';
      output.push({
        relativePath,
        sourceFingerprint: digest,
        content,
        category,
        eligible: Boolean(content) && category !== 'unknown',
        ...(content ? {} : { reason: 'empty' }),
      });
    }
  }
  await visit(root);
  return output;
}
