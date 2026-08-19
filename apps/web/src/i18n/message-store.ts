import { useEffect, useState } from 'react';
import { defaultLocale, type UiLocale } from './config';
import type { AppMessages } from './catalog';

/**
 * Client-side, per-locale message cache backing `I18nProvider` and the
 * portal-mounted content islands (`ContentRenderer`, `MathPlotLayer`).
 *
 * `catalog.ts` statically imports both `en.json` and `zh.json` so every
 * server-rendered page ships the full bilingual dictionary (~200 KB) even
 * though a visitor only ever needs one locale. This module code-splits the
 * two dictionaries via dynamic `import()` so only the active locale loads on
 * the critical path; the other locale is fetched lazily (see
 * `prefetchOtherLocale`) so switching still feels instant once it lands.
 */

const loaders: Record<UiLocale, () => Promise<{ default: AppMessages }>> = {
  en: () => import('../../messages/en.json') as unknown as Promise<{ default: AppMessages }>,
  zh: () => import('../../messages/zh.json') as unknown as Promise<{ default: AppMessages }>,
};

const cache = new Map<UiLocale, AppMessages>();
const pending = new Map<UiLocale, Promise<AppMessages>>();

/** Registers an already-known catalog (e.g. the server-provided initial
 * locale) so later lookups skip the network entirely. A no-op if the locale
 * is already cached. */
export function seedMessages(locale: UiLocale, catalog: AppMessages): void {
  if (!cache.has(locale)) cache.set(locale, catalog);
}

export function getCachedMessages(locale: UiLocale): AppMessages | undefined {
  return cache.get(locale);
}

export function loadMessages(locale: UiLocale): Promise<AppMessages> {
  const cached = cache.get(locale);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;

  const promise = loaders[locale]()
    .then(({ default: catalog }) => {
      cache.set(locale, catalog);
      pending.delete(locale);
      return catalog;
    })
    .catch((error: unknown) => {
      // Clear the in-flight entry on failure too, otherwise a rejected
      // promise (chunk load failure, offline, ...) sticks around forever
      // and the locale can never be retried without a full page reload.
      pending.delete(locale);
      throw error;
    });
  pending.set(locale, promise);
  return promise;
}

/** Warms the cache for the locale a visitor is *not* currently using, once
 * the main thread is idle, so a later language switch has no visible load. */
export function prefetchOtherLocale(currentLocale: UiLocale): void {
  if (typeof window === 'undefined') return;
  const other = currentLocale === 'en' ? 'zh' : 'en';
  if (cache.has(other) || pending.has(other)) return;

  const schedule = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
  schedule(() => {
    loadMessages(other).catch(() => {
      // Best-effort background prefetch; a real switch to this locale
      // will retry via `useIslandMessages`/`I18nProvider`.
    });
  });
}

const EMPTY_MESSAGES = {} as AppMessages;

/** Best-effort synchronous catalog for portal-mounted islands (they render
 * outside the main React tree via `createRoot`, so they can't read the root
 * `I18nProvider`'s context and instead read this module-level cache
 * directly). Falls back to the default locale, then an empty catalog, while
 * the requested locale's dictionary loads in the background. */
export function useIslandMessages(locale: UiLocale): AppMessages {
  const [catalogLocale, setCatalogLocale] = useState(locale);
  const [catalog, setCatalog] = useState<AppMessages>(
    () => getCachedMessages(locale) ?? getCachedMessages(defaultLocale) ?? EMPTY_MESSAGES,
  );

  // Derived-during-render update (not an effect): when `locale` changes and
  // its catalog is already cached, adopt it in the same render pass instead
  // of committing a stale frame first. See:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (locale !== catalogLocale) {
    const cached = getCachedMessages(locale);
    if (cached) {
      setCatalogLocale(locale);
      setCatalog(cached);
    }
  }

  useEffect(() => {
    if (getCachedMessages(locale)) return;
    let cancelled = false;
    loadMessages(locale)
      .then((loaded) => {
        if (!cancelled) {
          setCatalog(loaded);
          setCatalogLocale(locale);
        }
      })
      .catch(() => {
        // Stay on the already-cached/default-locale catalog; the load can
        // be retried later (e.g. on the next locale switch) since
        // `loadMessages` clears its in-flight entry on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return catalog;
}
