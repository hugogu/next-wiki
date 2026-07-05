import { z } from 'zod';
import { validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../../_shared/route';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Get a page's outbound links, classified by source.
 *
 * @openapi
 * @summary Get public wiki page outbound links
 * @description Returns the page's outbound links classified as markdown, wiki (`[[wikilink]]`),
 *   or frontmatter (`related_pages`), plus dangling and external links.
 * @tag Pages
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @response PublicOutboundLinksResponse
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await publicContent.getOutboundLinks(ctx, parsedParams.data.id));
});
