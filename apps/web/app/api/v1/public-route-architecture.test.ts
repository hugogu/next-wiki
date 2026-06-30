import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const API_V1_DIR = path.join(process.cwd(), 'app/api/v1');

async function routeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  }));
  return nested.flat();
}

describe('public API route architecture', () => {
  it('does not forward to or import existing internal API route handlers', async () => {
    const files = (await routeFiles(API_V1_DIR)).filter((file) => !file.includes('/_shared/'));

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"]@\/app\/api\//);
      // Relative parent imports are only allowed to reach the shared route helper,
      // at any nesting depth (e.g. ../_shared, ../../_shared, ../../../_shared).
      // The `(?!\.\.\/)` anchors the check to the final `../` so deeper paths are not
      // mistaken for a violation by backtracking.
      expect(source, file).not.toMatch(/from ['"](?:\.\.\/)+(?!\.\.\/)(?!_shared[/'"])/);
      expect(source, file).not.toMatch(/fetch\(['"`]\/api\/(?!v1\/)/);
    }
  });
});
