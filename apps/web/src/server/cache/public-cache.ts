import { revalidatePath, revalidateTag } from 'next/cache';

/** Shared data cache for anonymous, publicly readable wiki content. */
export const PUBLIC_CONTENT_CACHE_TAG = 'public-content';

/** Shared data cache for site-wide information rendered in the app shell. */
export const SITE_SHELL_CACHE_TAG = 'site-shell';

export function shouldUseDataCache(): boolean {
  return process.env.NODE_ENV !== 'test';
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
