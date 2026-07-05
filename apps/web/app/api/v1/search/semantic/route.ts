import { publicSemanticSearchSubmitInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import * as publicAi from '@/server/services/public-ai';

/**
 * Submit a semantic wiki search.
 *
 * @openapi
 * @summary Submit a semantic wiki search
 * @description Submits a query for background embedding and vector retrieval. Returns
 *   a search-action resource immediately; poll GET /search/semantic/{id} for results.
 *   Requires both the view and ai.read API-key scopes.
 * @tag Search
 * @auth bearer
 * @body PublicSemanticSearchSubmitInput
 * @response 202:PublicSemanticSearchAction
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const parsed = await parsePublicJson(request, publicSemanticSearchSubmitInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await publicAi.submitSemanticSearch(ctx, parsed.data), { status: 202 });
});
