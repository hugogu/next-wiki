import { AsyncLocalStorage } from 'node:async_hooks';
import { revalidatePath, revalidateTag } from 'next/cache';

const dataCacheContext = new AsyncLocalStorage<{ disabled: boolean }>();

/** Shared data cache for anonymous, publicly readable wiki content. */
export const PUBLIC_CONTENT_CACHE_TAG = 'public-content';

/** Shared data cache for site-wide information rendered in the app shell. */
export const SITE_SHELL_CACHE_TAG = 'site-shell';

/** Shared data cache for the public page tree that readers navigate, including managed help/guide pages. */
export const HELP_NAVIGATION_CACHE_TAG = 'help-navigation';

export function shouldUseDataCache(): boolean {
  return (
    dataCacheContext.getStore()?.disabled !== true &&
    process.env.NODE_ENV !== 'test' &&
    process.env.NEXT_WIKI_E2E !== 'true'
  );
}

/** Run server-side work that has no Next.js request cache context. */
export function runWithoutDataCache<T>(operation: () => T): T {
  return dataCacheContext.run({ disabled: true }, operation);
}

export function invalidatePublicContentCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(PUBLIC_CONTENT_CACHE_TAG, 'max');
  // The public navigation is embedded in the reader shell. Invalidating the
  // root layout ensures path, title, translation, and tree mutations refresh
  // both the affected document and every static shell that contains its tree.
  revalidatePath('/', 'layout');
}

export function invalidateSiteShellCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(SITE_SHELL_CACHE_TAG, 'max');
}

/**
 * Targeted invalidation for a managed guide page's create/update. Unlike
 * `invalidatePublicContentCache`, this never calls `revalidatePath('/', 'layout')`:
 * a setup/reinit guide write is infrequent and non-interactive, so it doesn't
 * need the same synchronous, site-wide layout rebuild an in-session user edit
 * does. Both affected representations still go stale immediately through
 * their tags and refetch on next read.
 */
export function invalidateManagedGuideCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(PUBLIC_CONTENT_CACHE_TAG, 'max');
  revalidateTag(HELP_NAVIGATION_CACHE_TAG, 'max');
}
