import type { Metadata } from 'next';
import type { LivePage } from '@next-wiki/shared';
import type { PermCtx } from '@/server/permissions';
import type { ServerTranslate } from '@/i18n/server';
import { buildPageDescription } from '@/lib/seo';
import * as pageService from '@/server/services/pages';
import { findRetiredLinkTarget } from '@/server/services/link-pages';
import { canonicalSpacePath, resolveSpacePrefix } from '@/server/services/space-routes';
import { resolveAddressTarget } from '@/server/services/page-addresses';
import { resolveSpace, type SpaceRow } from '@/server/services/spaces';
import { getReservedLocalePrefixes, isReservedLocalePrefix } from '@/server/services/translation-locales';

export type ResolvedReaderPage =
  | { kind: 'original'; page: LivePage; sourcePath: string; space: SpaceRow; legacy: boolean }
  | { kind: 'translation'; page: LivePage; locale: string; sourcePath: string; space: SpaceRow; legacy: boolean }
  | { kind: 'unavailable'; locale: string; sourcePath: string; space: SpaceRow; legacy: boolean }
  | { kind: 'forbidden'; visibility: 'public' | 'registered' | 'restricted'; legacy: boolean }
  | { kind: 'not_found' };

/** Resolve an external reader URL for either an anonymous or signed-in actor. */
export async function resolveReaderPage(ctx: PermCtx, rawSegments: string[]): Promise<ResolvedReaderPage> {
  const isAnonymous = ctx.actor.kind === 'anonymous';
  const segments = rawSegments.map((segment) => decodeURIComponent(segment));
  const prefix = segments[0] ? await resolveSpacePrefix(segments[0]) : null;
  let resolvedRoute = prefix
    ? { space: prefix.space, segments: segments.slice(1), legacy: prefix.isAlias }
    : null;
  if (!resolvedRoute) {
    const wiki = await resolveSpace();
    resolvedRoute = wiki ? { space: wiki, segments, legacy: true } : null;
  }
  if (!resolvedRoute || !resolvedRoute.segments.length) return { kind: 'not_found' };
  const { space, legacy } = resolvedRoute;
  const fullPath = resolvedRoute.segments.join('/');
  const reservedLocales = await getReservedLocalePrefixes();

  if (
    resolvedRoute.segments.length >= 2 &&
    isReservedLocalePrefix(reservedLocales, resolvedRoute.segments[0]!)
  ) {
    const locale = resolvedRoute.segments[0]!;
    const sourceSlug = resolvedRoute.segments.slice(1).join('/');
    const result = isAnonymous
      ? await pageService.getCachedPublicLiveTranslationBySlug(locale, sourceSlug, space.slug)
      : await pageService.getLiveTranslationBySlug(ctx, locale, sourceSlug, space.slug);
    if (result.kind === 'page') return { kind: 'translation', page: result.page, locale, sourcePath: sourceSlug, space, legacy };
    if (result.kind === 'unavailable') return { kind: 'unavailable', locale, sourcePath: result.sourcePath, space, legacy };
    if (result.kind === 'forbidden') return { kind: 'forbidden', visibility: result.visibility, legacy };
  }

  // 035 (steps 2-3): a live page's current slug always wins over a stale
  // alias — this must run before the step-4 alias lookup below.
  const original = isAnonymous
    ? await pageService.getCachedPublicLiveBySlug(fullPath, space.slug)
    : await pageService.getLiveBySlug(ctx, fullPath, space.slug);
  if (original) return { kind: 'original', page: original, sourcePath: fullPath, space, legacy };

  const access = await pageService.getReaderAccessStatusBySlug(ctx, fullPath, space.slug);
  if (access) return { ...access, legacy };

  // 035 (step 4, US2): a retained or manual address. Resolve it to the
  // *current* canonical slug (never the alias itself, so a rename chain
  // never forms — research R6) and re-run the ordinary original/translation
  // lookup, so read permission is re-checked on the final target exactly as
  // it would be for a direct hit (FR-009).
  const aliasTarget = await resolveAddressTarget(space.id, fullPath);
  if (aliasTarget?.locale) {
    const result = isAnonymous
      ? await pageService.getCachedPublicLiveTranslationBySlug(aliasTarget.locale, aliasTarget.slug, space.slug)
      : await pageService.getLiveTranslationBySlug(ctx, aliasTarget.locale, aliasTarget.slug, space.slug);
    if (result.kind === 'page') {
      return { kind: 'translation', page: result.page, locale: aliasTarget.locale, sourcePath: aliasTarget.slug, space, legacy: true };
    }
    if (result.kind === 'unavailable') {
      return { kind: 'unavailable', locale: aliasTarget.locale, sourcePath: result.sourcePath, space, legacy: true };
    }
    if (result.kind === 'forbidden') return { kind: 'forbidden', visibility: result.visibility, legacy: true };
  } else if (aliasTarget) {
    const target = isAnonymous
      ? await pageService.getCachedPublicLiveBySlug(aliasTarget.slug, space.slug)
      : await pageService.getLiveBySlug(ctx, aliasTarget.slug, space.slug);
    if (target) return { kind: 'original', page: target, sourcePath: aliasTarget.slug, space, legacy: true };
    const targetAccess = await pageService.getReaderAccessStatusBySlug(ctx, aliasTarget.slug, space.slug);
    if (targetAccess) return { ...targetAccess, legacy: true };
  }

  const retiredTarget = await findRetiredLinkTarget(fullPath);
  if (!retiredTarget) return { kind: 'not_found' };
  const targetSpace = await resolveSpace(retiredTarget.spaceSlug);
  const target = targetSpace && (isAnonymous
    ? await pageService.getCachedPublicLivePage(retiredTarget.path, targetSpace.slug)
    : await pageService.getLive(ctx, retiredTarget.path, targetSpace.slug));
  return target && targetSpace
    ? { kind: 'original', page: target, sourcePath: target.slug, space: targetSpace, legacy: true }
    : { kind: 'not_found' };
}

export interface ReaderMetadataOptions {
  siteUrl: string;
  locale: string;
  t: ServerTranslate;
  /** Title shown for not_found / unavailable / forbidden resolutions. */
  fallbackTitle: string;
  /**
   * Whether this route's URL is the one crawlers/search engines should see.
   * The public reader route is; internal proxy targets (e.g. the
   * authenticated-user rewrite) are not and must always stay noindex,nofollow
   * even for a page that would otherwise be indexable.
   */
  indexable: boolean;
}

/**
 * Build the page `<head>` metadata for a resolved reader page. Shared by every
 * route that renders `ResolvedReaderPage` (the public static route and the
 * authenticated-user proxy route) so they never drift out of sync.
 */
export async function buildReaderMetadata(
  resolved: ResolvedReaderPage,
  { siteUrl, locale, t, fallbackTitle, indexable }: ReaderMetadataOptions,
): Promise<Metadata> {
  const robots = { index: false, follow: indexable };

  if (resolved.kind === 'not_found' || resolved.kind === 'unavailable' || resolved.kind === 'forbidden') {
    return { title: fallbackTitle, robots };
  }

  const { page } = resolved;
  if (page.status !== 'published') {
    return { title: page.title, robots };
  }

  const isTranslation = resolved.kind === 'translation';
  const canonicalPath = canonicalSpacePath(resolved.space, resolved.sourcePath, isTranslation ? resolved.locale : null);
  const description = buildPageDescription(page.contentHtml, t('site.description'));

  // hreflang alternates: the original plus every published translation in the
  // group. Original is the default alternate, never a redirect target.
  const translatedLocales = await pageService.getCachedPublishedTranslationLocales(resolved.sourcePath, resolved.space.slug);
  const languages: Record<string, string> = {
    'x-default': `${siteUrl}${canonicalSpacePath(resolved.space, resolved.sourcePath)}`,
  };
  for (const loc of translatedLocales) {
    languages[loc] = `${siteUrl}${canonicalSpacePath(resolved.space, resolved.sourcePath, loc)}`;
  }

  return {
    title: page.title,
    description,
    alternates: { canonical: `${siteUrl}${canonicalPath}`, languages },
    openGraph: {
      type: 'article',
      url: `${siteUrl}${canonicalPath}`,
      title: page.title,
      description,
      siteName: t('common.brand'),
      locale: isTranslation && resolved.locale === 'zh' ? 'zh_CN' : locale === 'zh' ? 'zh_CN' : 'en_US',
      ...(page.publishedAt ? { publishedTime: page.publishedAt } : {}),
      ...(page.authorDisplayName ? { authors: [page.authorDisplayName] } : {}),
    },
    twitter: { card: 'summary_large_image', title: page.title, description },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}
