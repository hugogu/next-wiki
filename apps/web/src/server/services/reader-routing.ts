import type { LivePage } from '@next-wiki/shared';
import type { PermCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import { findRetiredLinkTarget } from '@/server/services/link-pages';
import { findPageRouteRedirectTarget, resolveSpacePrefix } from '@/server/services/space-routes';
import { resolveSpace, type SpaceRow } from '@/server/services/spaces';

const LOCALE_PREFIX_RE = /^[a-z]{2}$/;

export type ResolvedReaderPage =
  | { kind: 'original'; page: LivePage; sourcePath: string; space: SpaceRow; legacy: boolean }
  | { kind: 'translation'; page: LivePage; locale: string; sourcePath: string; space: SpaceRow; legacy: boolean }
  | { kind: 'unavailable'; locale: string; sourcePath: string; space: SpaceRow; legacy: boolean }
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

  if (resolvedRoute.segments.length >= 2 && LOCALE_PREFIX_RE.test(resolvedRoute.segments[0]!)) {
    const locale = resolvedRoute.segments[0]!;
    const sourcePath = resolvedRoute.segments.slice(1).join('/');
    const result = isAnonymous
      ? await pageService.getCachedPublicLiveTranslation(locale, sourcePath, space.slug)
      : await pageService.getLiveTranslation(ctx, locale, sourcePath, space.slug);
    if (result.kind === 'page') return { kind: 'translation', page: result.page, locale, sourcePath, space, legacy };
    if (result.kind === 'unavailable') return { kind: 'unavailable', locale, sourcePath: result.sourcePath, space, legacy };
  }

  const original = isAnonymous
    ? await pageService.getCachedPublicLivePage(fullPath, space.slug)
    : await pageService.getLive(ctx, fullPath, space.slug);
  if (original) return { kind: 'original', page: original, sourcePath: fullPath, space, legacy };

  const movedTarget = await findPageRouteRedirectTarget(`/${segments.join('/')}`);
  const retiredTarget = movedTarget ?? await findRetiredLinkTarget(fullPath);
  if (!retiredTarget) return { kind: 'not_found' };
  const targetSpace = await resolveSpace(retiredTarget.spaceSlug);
  const target = targetSpace && (isAnonymous
    ? await pageService.getCachedPublicLivePage(retiredTarget.path, targetSpace.slug)
    : await pageService.getLive(ctx, retiredTarget.path, targetSpace.slug));
  return target && targetSpace
    ? { kind: 'original', page: target, sourcePath: retiredTarget.path, space: targetSpace, legacy: true }
    : { kind: 'not_found' };
}
