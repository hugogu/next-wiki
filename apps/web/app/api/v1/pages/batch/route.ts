import { publicPageBatchCreateInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Create multiple pages atomically.
 *
 * @openapi
 * @summary Batch create public wiki pages
 * @description Creates up to 50 pages in a single atomic transaction.
 * @tag Pages
 * @auth bearer
 * @body PublicPageBatchCreateInput
 * @response 201:PublicBatchCreateResult
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, publicPageBatchCreateInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicContent.batchCreatePages(ctx, parsed.data), { status: 201 });
});
