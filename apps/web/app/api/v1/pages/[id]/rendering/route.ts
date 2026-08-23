import { z } from 'zod';
import { publicJson, withPublicApi } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Re-render a page with the current Markdown pipeline.
 *
 * @openapi
 * @summary Re-render public wiki page
 * @description Renders the page's live revisions (published and latest draft) again from their stored Markdown, without creating a revision or changing content. Use after a fix to the render pipeline, which otherwise only reaches pages that are edited afterwards.
 * @tag Pages
 * @auth bearer
 * @pathParams PublicPageIdPathParams
 * @response PublicPageRenderingResult
 */
export const POST = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await publicContent.rerenderPage(ctx, parsedParams.data.id));
});
