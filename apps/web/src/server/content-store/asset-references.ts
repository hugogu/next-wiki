/**
 * Extract the asset ids a piece of Markdown references via application-relative
 * asset URLs. Two app-relative shapes are recognized: the internal UI URL
 * (`/api/assets/{id}`) and the public API URL (`/api/v1/assets/{id}/content`).
 * Used on save to synchronize `content_asset_refs` so image lifecycle is
 * reference-aware (plan D2).
 *
 * Only app-relative URLs are recognized — backend paths never appear in stored
 * Markdown (FR-004). Matching is intentionally permissive about the surrounding
 * Markdown/HTML syntax (image, link, or raw `<img>`); it keys off the URL shape.
 */
const ASSET_URL = /\/api\/(?:v1\/)?assets\/([A-Za-z0-9-]{36})/g;

export function extractAssetIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(ASSET_URL)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}
