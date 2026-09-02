import { agentMemoryWikiPageReadInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../../../_shared';
import { parsePublicQuery } from '../../../../_shared/route';
import { readKnowledgePage } from '@/server/services/agent-memory-documents';

/**
 * @openapi
 * @summary Read one currently visible next-wiki page
 * @description Re-authorizes the selected page against the bound integration key's current grants.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @queryParams AgentMemoryWikiPageReadQuery
 * @response AgentMemoryWikiPage
 */
export const GET = withPublicApi<{ pageId: string }>(async (request, context, ctx) => {
  assertSupportedProvider(request);
  const { pageId } = await context.params;
  const parsed = parsePublicQuery(request, agentMemoryWikiPageReadInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await readKnowledgePage(ctx, pageId, parsed.data.maxChars));
});
