import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { extractContentImages } from '@/lib/seo';
import { getSiteView } from '@/server/services/site-settings';

/**
 * Link-preview ("social") image resolution.
 *
 * Content platforms — X, Facebook, Slack, Telegram, WeChat, Feishu — build a
 * share card from `og:image`. Declaring `twitter:card = summary_large_image`
 * without one renders an empty grey placeholder instead of a card, so the
 * image and the card type must always be decided together; that is why this
 * module reports which *kind* of image it found rather than just a URL.
 */

/**
 * Formats the major crawlers actually render. SVG is excluded on purpose: X
 * and Facebook both reject it, and our SVG assets are additionally served
 * under a strict sandbox CSP rather than as plain bytes.
 */
const SHAREABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** The two app-relative shapes a stored asset is referenced by (see asset-references.ts). */
const ASSET_PATH =
  /^\/api\/(?:v1\/)?assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/content)?(?:[?#]|$)/i;

export interface SocialImage {
  /** Absolute URL — crawlers do not resolve relative `og:image` values reliably. */
  url: string;
  alt: string | null;
  /**
   * `content` is a real illustration from the page body and warrants a large
   * card; `site` is the site logo, which only looks right in a compact one.
   */
  kind: 'content' | 'site';
}

/** Shape a resolved share image the way Next's `Metadata` types expect it. */
export function toMetadataImage(image: SocialImage): { url: string; alt?: string } {
  return { url: image.url, ...(image.alt ? { alt: image.alt } : {}) };
}

/**
 * Pick the share image for a rendered page body: the first body illustration a
 * crawler can actually fetch and render, else the site icon when it is a raster
 * one, else nothing.
 *
 * Asset candidates are validated against `content_assets` rather than trusted
 * from the markup, so a deleted asset or an SVG diagram never becomes the card
 * image. Permission is deliberately *not* re-checked here: the caller has
 * already resolved a page the actor may read, and every image in that page's
 * body is served under that same page's read rule.
 */
export async function resolvePageSocialImage(
  contentHtml: string,
  siteUrl: string,
): Promise<SocialImage | null> {
  const candidates = extractContentImages(contentHtml);
  const assetIds = candidates
    .map((ref) => ref.url.match(ASSET_PATH)?.[1]?.toLowerCase())
    .filter((id): id is string => Boolean(id));

  const shareableAssetIds = assetIds.length ? await filterShareableAssets(assetIds) : new Set<string>();

  for (const ref of candidates) {
    const assetId = ref.url.match(ASSET_PATH)?.[1]?.toLowerCase();
    if (assetId) {
      if (shareableAssetIds.has(assetId)) {
        return { url: `${siteUrl}${ref.url}`, alt: ref.alt, kind: 'content' };
      }
      continue;
    }
    // A non-asset reference: only an absolute URL is usable, and only when its
    // extension does not give it away as a format crawlers reject.
    if (/^https?:\/\//i.test(ref.url) && !/\.svg(?:[?#]|$)/i.test(ref.url)) {
      return { url: ref.url, alt: ref.alt, kind: 'content' };
    }
  }

  return resolveSiteSocialImage(siteUrl);
}

/**
 * The site-wide share image: the configured icon, but only when it is a format
 * crawlers render. The shipped default icon is an SVG, so a site that never
 * uploaded a raster one simply has no share image — which is still better than
 * promising a large card and delivering an empty placeholder.
 */
export async function resolveSiteSocialImage(siteUrl: string): Promise<SocialImage | null> {
  const site = await getSiteView();
  if (site.iconMime && SHAREABLE_IMAGE_TYPES.has(site.iconMime)) {
    return { url: `${siteUrl}${site.iconUrl}`, alt: null, kind: 'site' };
  }
  return null;
}

async function filterShareableAssets(assetIds: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.contentAssets.id, contentType: schema.contentAssets.contentType })
    .from(schema.contentAssets)
    .where(
      and(
        inArray(schema.contentAssets.id, [...new Set(assetIds)]),
        isNull(schema.contentAssets.deletedAt),
      ),
    );
  return new Set(
    rows.filter((row) => SHAREABLE_IMAGE_TYPES.has(row.contentType)).map((row) => row.id.toLowerCase()),
  );
}
