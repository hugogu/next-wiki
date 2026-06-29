import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('public content audit integration', () => {
  it('routes public API handlers through the shared audit wrapper without reading bodies for audit', async () => {
    const sharedRoute = await readFile(path.join(process.cwd(), 'app/api/v1/_shared/route.ts'), 'utf8');
    expect(sharedRoute).toContain('withApiAudit');
    expect(sharedRoute).not.toMatch(/request\.text\(\)|request\.arrayBuffer\(\)/);
  });
});
