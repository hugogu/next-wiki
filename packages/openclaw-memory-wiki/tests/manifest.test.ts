import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type Manifest = {
  id: string;
  version: string;
  activation: { onStartup: boolean };
  configSchema: { required: string[]; properties: Record<string, unknown> };
  skills: string[];
  contracts: { tools: string[] };
};

describe('OpenClaw manifest', () => {
  it('declares the compiled runtime, bundled Skill, and every registered tool', async () => {
    const manifest = JSON.parse(await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8')) as Manifest;

    expect(manifest.id).toBe('next-wiki-memory-wiki');
    expect(manifest.activation.onStartup).toBe(true);
    expect(manifest.configSchema.required).toEqual(expect.arrayContaining(['baseUrl', 'apiKeyRef', 'vaultPath']));
    expect(manifest.configSchema.required).not.toContain('mirrorApiKeyRef');
    expect(manifest.configSchema.required).not.toContain('knowledgeApiKeyRef');
    expect(manifest.skills).toContain('./skills');
    expect(manifest.contracts.tools.sort()).toEqual([
      'next_wiki_get',
      'next_wiki_search',
      'next_wiki_status',
      'next_wiki_sync',
    ]);

    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
      openclaw?: { runtimeExtensions?: string[]; version?: string; install?: { npmSpec?: string } };
    };
    expect(packageJson.openclaw?.runtimeExtensions).toEqual(['./dist/index.js']);
    expect(manifest.version).toBe(packageJson.version);
    expect(packageJson.openclaw?.version).toBe(packageJson.version);
    expect(packageJson.openclaw?.install?.npmSpec).toBe(`${packageJson.name}@${packageJson.version}`);
  });
});
