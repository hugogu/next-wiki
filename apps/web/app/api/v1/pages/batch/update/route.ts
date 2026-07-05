import { publicDryRunQuerySchema, publicPageBatchUpdateInputSchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * Batch update up to 50 pages (title, path, and/or frontmatter patch).
 *
 * @openapi
 * @summary Batch update public wiki pages
 * @description Updates up to 50 pages per request. Each item is atomic on its own but
 *   the batch is not transactional across items — partial success is reported per item.
 *   Pass ?dry_run=true to preview the outcome without writing.
 * @tag Pages
 * @auth bearer
 * @body PublicPageBatchUpdateInput
 * @response PublicPageBatchUpdateResult
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsedQuery = parsePublicQuery(request, publicDryRunQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;
  const parsedBody = await parsePublicJson(request, publicPageBatchUpdateInputSchema);
  if (!parsedBody.ok) return parsedBody.response;

  return publicJson(await publicContent.batchUpdatePages(ctx, parsedBody.data, { dryRun: parsedQuery.data.dry_run }));
});
