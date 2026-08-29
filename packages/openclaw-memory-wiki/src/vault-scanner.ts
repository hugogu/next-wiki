import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export type VaultDocument = { sourcePath: string; content: string; sourceDigest: string; sizeBytes: number };
const EXCLUDED = new Set(['_attachments', '.openclaw-wiki', 'attachments', 'state']);

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
}

export async function scanVault(vaultPath: string, maxBytes = 512_000): Promise<VaultDocument[]> {
  const root = await resolve(vaultPath);
  const documents: VaultDocument[] = [];
  async function walk(directory: string): Promise<void> {
    if (!isInside(root, directory)) throw new Error('Vault path escaped root');
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
      if (EXCLUDED.has(entry.name)) continue;
      const fullPath = join(directory, entry.name);
      const stat = await lstat(fullPath);
      if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the Memory Wiki vault: ${entry.name}`);
      if (stat.isDirectory()) { await walk(fullPath); continue; }
      if (!stat.isFile() || !entry.name.toLocaleLowerCase().endsWith('.md')) continue;
      if (stat.size > maxBytes) throw new Error(`Markdown file exceeds the configured limit: ${relative(root, fullPath)}`);
      const content = await readFile(fullPath, 'utf8');
      const after = await lstat(fullPath);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
        throw new Error(`Markdown file changed during scan: ${relative(root, fullPath)}`);
      }
      const sourcePath = relative(root, fullPath).split(sep).join('/');
      documents.push({ sourcePath, content, sourceDigest: createHash('sha256').update(content, 'utf8').digest('hex'), sizeBytes: stat.size });
    }
  }
  await walk(root);
  return documents;
}
