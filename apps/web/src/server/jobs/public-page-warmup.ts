import { env } from '@/server/config';
import { logger } from '@/server/logger';

const WARMUP_TIMEOUT_MS = 10_000;

function assertPublicHref(href: string): void {
  if (!href.startsWith('/') || href.startsWith('//')) {
    throw new Error('Public page warmup requires an absolute-path URL');
  }
}

/** Construct a loopback URL without allowing a queued path to select an origin. */
export function buildPublicWarmupUrl(href: string, internalOrigin = env.APP_INTERNAL_URL): string {
  assertPublicHref(href);
  return new URL(href, internalOrigin).toString();
}

/**
 * Ask the local Next.js server to materialize an on-demand ISR page after it
 * has been published. The HTML body is already stored with the revision; this
 * request only composes and persists the page-level ISR response before a
 * reader arrives. It intentionally goes to APP_INTERNAL_URL, never APP_URL.
 */
export async function runPublicPageWarmup(href: string): Promise<void> {
  const url = buildPublicWarmupUrl(href);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'x-next-wiki-cache-warmup': '1' },
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    });
    // Drain the response so a streamed ISR generation finishes before this job
    // acknowledges completion. A stale delete may legitimately return 404.
    await response.arrayBuffer();
    if (!response.ok && response.status !== 404) {
      throw new Error(`warmup returned ${response.status}`);
    }
    logger.info('public page ISR warmed', { href, status: response.status });
  } catch (error) {
    // Throw so pg-boss retries; the publish transaction has already committed
    // and readers can still generate the page on demand as a safe fallback.
    logger.warn('public page ISR warmup failed', {
      href,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
