import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverSources } from '../src/source-discovery';
import { buildPreview } from '../src/preview';
import { ImportLedger } from '../src/ledger';
import { importIdempotencyKey, runImport } from '../src/import-runner';

describe('OpenClaw memory migration', () => {
  it('previews eligible memory files and excludes unknown sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-wiki-migrate-'));
    await mkdir(join(root, 'memory'));
    await writeFile(join(root, 'memory', 'decisions.md'), '# Decision\nUse retries.');
    await writeFile(join(root, 'notes.md'), 'not classified');
    const candidates = await discoverSources(root);
    const preview = buildPreview(candidates);
    expect(preview.eligibleCount).toBe(1);
    expect(preview.candidates.find((item) => item.relativePath === 'notes.md')?.eligible).toBe(false);
  });

  it('requires approval, resumes idempotently, and never deletes source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-wiki-migrate-'));
    const source = join(root, 'memory.md');
    await writeFile(source, 'memory');
    const [candidate] = await discoverSources(root);
    const ledger = await ImportLedger.load(join(root, 'ledger.json'), 'run-1', [{ fingerprint: candidate.sourceFingerprint, idempotencyKey: importIdempotencyKey(candidate), status: 'pending' }]);
    const saves: string[] = [];
    await expect(runImport(ledger, [candidate], { save: async (input) => { saves.push(input.idempotencyKey); return {}; } }, false)).rejects.toThrow('approval');
    await runImport(ledger, [candidate], { save: async (input) => { saves.push(input.idempotencyKey); return {}; } }, true);
    await runImport(ledger, [candidate], { save: async (input) => { saves.push(input.idempotencyKey); return {}; } }, true);
    expect(saves).toEqual([importIdempotencyKey(candidate)]);
    expect((await ledger.snapshot).state).toBe('completed');
    expect(await readFile(source, 'utf8')).toBe('memory');
  });
});
