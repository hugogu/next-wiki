import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export type VaultDocument = { sourcePath: string; content: string; sourceDigest: string; sizeBytes: number };
const EXCLUDED = new Set(['_attachments', '.openclaw-wiki', 'attachments', 'state']);

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
}

function toSourcePath(root: string, fullPath: string): string {
  return relative(root, fullPath).split(sep).join('/');
}

export async function scanVault(vaultPath: string, maxBytes = 512_000, onSkip?: (sourcePath: string, reason: 'too_large' | 'changed_during_scan' | 'unreadable') => void): Promise<VaultDocument[]> {
  const root = await resolve(vaultPath);
  const documents: VaultDocument[] = [];
  async function walk(directory: string): Promise<void> {
    if (!isInside(root, directory)) throw new Error('Vault path escaped root');
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
      if (EXCLUDED.has(entry.name)) continue;
      const fullPath = join(directory, entry.name);
      const sourcePath = toSourcePath(root, fullPath);
      // Each fs call is wrapped individually so a single deleted/moved/locked
      // entry does not abort the whole scan. Security boundaries (symlinks,
      // path-escape) still throw — they are policy errors, not race conditions.
      let stat;
      try { stat = await lstat(fullPath); }
      catch { onSkip?.(sourcePath, 'unreadable'); continue; }
      if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the Memory Wiki vault: ${entry.name}`);
      if (stat.isDirectory()) { await walk(fullPath); continue; }
      if (!stat.isFile() || !entry.name.toLocaleLowerCase().endsWith('.md')) continue;
      if (stat.size > maxBytes) { onSkip?.(sourcePath, 'too_large'); continue; }
      let content;
      try { content = await readFile(fullPath, 'utf8'); }
      catch { onSkip?.(sourcePath, 'unreadable'); continue; }
      let after;
      try { after = await lstat(fullPath); }
      catch { onSkip?.(sourcePath, 'unreadable'); continue; }
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
        onSkip?.(sourcePath, 'changed_during_scan');
        continue;
      }
      documents.push({ sourcePath, content, sourceDigest: createHash('sha256').update(content, 'utf8').digest('hex'), sizeBytes: stat.size });
    }
  }
  await walk(root);
  return documents;
}
