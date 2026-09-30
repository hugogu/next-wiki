import { z } from 'zod';
import { publicPageIncludeQuerySchema } from '@next-wiki/shared';
import { publicApiError } from '@/server/api/public-errors';
import { getPageByReference } from '@/server/services/public-page-reference';
import { parsePublicQuery, publicJson, withPublicApi } from '../../_shared/route';

const querySchema = publicPageIncludeQuerySchema.extend({ url: z.string().min(1).max(2048) });

/**
 * @openapi
 * @summary Resolve a Wiki reader URL
 * @description Resolve an absolute same-origin URL or relative reader address using the reader's configured space prefixes, canonical slugs, translations, and retained aliases. Returns readable Markdown and the stable page id. Query strings and fragments do not affect resolution. Missing or inaccessible pages return 404.
 * @tag Pages
 * @auth bearer
 * @queryParams PublicPageResolveQuery
 * @response PublicPageResource
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  const parsed = parsePublicQuery(request, querySchema);
  if (!parsed.ok) return parsed.response;
  const page = await getPageByReference(ctx, parsed.data.url, process.env.APP_URL || new URL(request.url).origin, parsed.data.include);
  if (!page) return publicApiError('NOT_FOUND', 'Page not found', 404);
  return publicJson(page);
});
