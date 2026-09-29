import type { MetadataRoute } from 'next';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { canonicalSpacePath } from '@/server/services/space-routes';
import { listSpaces } from '@/server/services/spaces';
import { resolvePageSocialImage } from '@/server/services/social-image';
import { env } from '@/server/config';

// `sitemap` reads from PostgreSQL via `pageService.listPublished`. Prerendering
// it at build time (the default for MetadataRoute routes) would require a
// reachable database inside the Docker builder, which we do not have. Render
// the sitemap on demand instead, matching how every other DB-touching route
// in this app (healthz, readyz, public-openapi.json, admin pages stats) opts
// out of static generation.
export const dynamic = 'force-dynamic';

/**
 * /sitemap.xml — list every page visible to anonymous visitors, plus the
 * site root and the index page.
 *
 * `pageService.listPublished` already enforces the anonymous-read policy on
 * the space, so private wikis only emit URLs the visitor could reach anyway.
 *
 * Drafts are intentionally excluded — they are not published yet and should
 * not surface in search results.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  const ctx = buildAnonymousCtx();

  const spaces = await listSpaces();
  const pagesBySpace = await Promise.all(spaces.map(async (space) => ({
    space,
    pages: await pageService.listPublished(ctx, { spaceSlug: space.slug, includeContentHtml: true }),
  })));
  const pages = pagesBySpace.flatMap(({ space, pages }) => pages.map((page) => ({ space, page })));

  const entries: MetadataRoute.Sitemap = await Promise.all(pages.map(async ({ space, page }) => {
    const image = await resolvePageSocialImage(page.contentHtml, siteUrl, false);
    return {
      url: `${siteUrl}${canonicalSpacePath(space, page.slug)}`,
      lastModified: page.updatedAt ?? page.publishedAt ?? undefined,
      ...(image?.kind === 'content' ? { images: [image.url] } : {}),
    };
  }));

  const latestUpdate = pages.reduce<string | undefined>((latest, { page }) => {
    const modified = page.updatedAt ?? page.publishedAt ?? undefined;
    return modified && (!latest || modified > latest) ? modified : latest;
  }, undefined);

  entries.unshift(
    {
      url: `${siteUrl}/`,
      ...(latestUpdate ? { lastModified: latestUpdate } : {}),
    },
    {
      url: `${siteUrl}/pages`,
      ...(latestUpdate ? { lastModified: latestUpdate } : {}),
    },
  );

  return entries;
}
