import type { MetadataRoute } from 'next';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { getPageHref } from '@/lib/path';
import { env } from '@/server/config';

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

  const pages = await pageService.listPublished(ctx);

  const entries: MetadataRoute.Sitemap = pages.map((page) => ({
    url: `${siteUrl}${getPageHref(page.path)}`,
    lastModified: page.updatedAt ?? page.publishedAt ?? undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Surface the homepage and the alphabetical page index ahead of individual
  // pages so search engines prefer the curated entry points.
  entries.unshift(
    {
      url: `${siteUrl}/`,
      lastModified: pages[0]?.updatedAt ?? pages[0]?.publishedAt ?? new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/pages`,
      lastModified: pages[0]?.updatedAt ?? pages[0]?.publishedAt ?? new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  );

  return entries;
}