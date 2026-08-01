import { join } from 'node:path';

/**
 * Where the build-time static site assets live.
 *
 * The stylesheet, client runtime, and KaTeX resources do not vary with wiki
 * content, so they are produced once per image by
 * `pnpm --filter @next-wiki/web build:static-site-assets` and copied verbatim
 * into each snapshot. Building them per publish would add a CSS/JS toolchain to
 * the runtime path for no benefit.
 */
export function staticSiteAssetsDir(): string {
  return join(process.cwd(), 'public', 'static-site');
}
