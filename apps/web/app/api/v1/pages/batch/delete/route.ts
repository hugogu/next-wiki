import { publicDryRunQuerySchema, publicPageBatchDeleteInputSchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Batch soft-delete up to 50 pages.
 *
 * @openapi
 * @summary Batch delete public wiki pages
 * @description Soft-deletes up to 50 pages per request (no hard delete). Each item is
 *   atomic on its own but the batch is not transactional across items. Pass
 *   ?dry_run=true to preview which pages would be deleted without writing.
 * @tag Pages
 * @auth bearer
 * @body PublicPageBatchDeleteInput
 * @response PublicPageBatchDeleteResult
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsedQuery = parsePublicQuery(request, publicDryRunQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;
  const parsedBody = await parsePublicJson(request, publicPageBatchDeleteInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.batchSoftDeletePages(ctx, parsedBody.data, { dryRun: parsedQuery.data.dry_run }));
});
