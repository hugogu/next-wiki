import { publicJson, withPublicApi } from '../../_shared/route';
import * as publicContent from '@/server/services/public-content';

/**
 * List pages that link to this page.
 *
 * @openapi
 * @summary Get public wiki page backlinks
 * @description Returns pages visible to the caller that contain Markdown links to the target page.
 * @tag Public Wiki Content
 * @auth bearer
 * @response PublicBacklinksResponse
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const { id } = await params;
  return publicJson(await publicContent.getBacklinks(ctx, id));
});
