import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DocumentAssets } from './document';

/**
 * Locate the build-time static site assets and their content-hashed names.
 *
 * The stylesheet, client runtime, and KaTeX resources do not vary with wiki
 * content, so they are produced once per image by
 * `pnpm --filter @next-wiki/web build:static-site-assets` and copied verbatim
 * into each snapshot. Building them per publish would put a CSS/JS toolchain on
 * the runtime path for no benefit.
 *
 * Filenames carry a content hash so a reader's browser cache can never mix
 * assets across publishes.
 */

export class StaticSiteAssetsMissingError extends Error {
  constructor(directory: string) {
    super(
      `Static site assets are missing from ${directory}. Run "pnpm --filter @next-wiki/web build:static-site-assets"; ` +
        'the published site would otherwise reference a stylesheet and script that do not exist.',
    );
    this.name = 'StaticSiteAssetsMissingError';
  }
}

export function staticSiteAssetsDir(): string {
  return join(process.cwd(), 'public', 'static-site');
}

/**
 * Read the manifest written by the build step.
 *
 * A missing manifest fails the publish rather than shipping a site whose CSS
 * and JavaScript 404 — a silently unstyled site is worse than a failed run,
 * because the failure is visible to the operator and the breakage is not.
 */
export async function readStaticSiteAssets(
  directory = staticSiteAssetsDir(),
): Promise<DocumentAssets> {
  let raw: string;
  try {
    raw = await readFile(join(directory, 'manifest.json'), 'utf8');
  } catch {
    throw new StaticSiteAssetsMissingError(directory);
  }

  const manifest = JSON.parse(raw) as Partial<DocumentAssets>;
  if (!manifest.stylesheet || !manifest.script || !manifest.katexStylesheet) {
    throw new StaticSiteAssetsMissingError(directory);
  }

  // Paths are relative to the artifact's reserved `_static/` prefix, which is
  // where the publish job copies this directory.
  return {
    stylesheet: `_static/${manifest.stylesheet}`,
    script: `_static/${manifest.script}`,
    katexStylesheet: `_static/${manifest.katexStylesheet}`,
  };
}
