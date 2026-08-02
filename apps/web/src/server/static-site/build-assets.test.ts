import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readStaticSiteAssets,
  staticSiteAssetsDir,
  StaticSiteAssetsMissingError,
} from './build-assets';

const dirs: string[] = [];

async function assetsDir(manifest?: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-assets-'));
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  if (manifest) {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  }
  return dir;
}

afterEach(async () => {
  delete process.env.STATIC_SITE_ASSETS_DIR;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('staticSiteAssetsDir', () => {
  it('resolves under the working directory by default', () => {
    expect(staticSiteAssetsDir()).toBe(join(process.cwd(), 'public', 'static-site'));
  });

  it('honors an explicit override, so a path mismatch is fixable without a code change', () => {
    process.env.STATIC_SITE_ASSETS_DIR = '/somewhere/else';
    expect(staticSiteAssetsDir()).toBe('/somewhere/else');
  });
});

describe('readStaticSiteAssets', () => {
  it('prefixes each asset with the artifact reserved directory', async () => {
    const dir = await assetsDir({
      stylesheet: 'site.abc123.css',
      script: 'site.DEF456.js',
      katexStylesheet: 'katex.789.css',
    });
    await expect(readStaticSiteAssets(dir)).resolves.toEqual({
      stylesheet: '_static/site.abc123.css',
      script: '_static/site.DEF456.js',
      katexStylesheet: '_static/katex.789.css',
    });
  });

  it('fails with actionable guidance when the build step never ran', async () => {
    // Shipping a site whose CSS and JS 404 is worse than failing the publish:
    // the failure is visible to the operator, the silent breakage is not.
    const dir = await assetsDir();
    const error = await readStaticSiteAssets(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StaticSiteAssetsMissingError);
    expect((error as Error).message).toContain('build:static-site-assets');
    expect((error as Error).message).toContain('rebuild the image');
  });

  it('rejects an incomplete manifest rather than emitting a broken reference', async () => {
    const dir = await assetsDir({ stylesheet: 'site.css' });
    await expect(readStaticSiteAssets(dir)).rejects.toBeInstanceOf(StaticSiteAssetsMissingError);
  });
});
