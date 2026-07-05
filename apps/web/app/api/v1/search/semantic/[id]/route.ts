import { z } from 'zod';
import { validationError } from '@/server/api/public-errors';
import { publicJson, withPublicApi } from '../../../_shared/route';
import * as publicAi from '@/server/services/public-ai';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Poll a semantic wiki search action.
 *
 * @openapi
 * @summary Get semantic wiki search results
 * @description Polls the status and results of a previously submitted semantic search action.
 * @tag Search
 * @auth bearer
 * @pathParams PublicSemanticSearchIdPathParams
 * @response PublicSemanticSearchAction
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await publicAi.getSemanticSearchResults(ctx, parsedParams.data.id));
});
