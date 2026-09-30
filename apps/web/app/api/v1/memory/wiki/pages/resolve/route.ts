import { agentMemoryWikiPageResolveInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../../../_shared';
import { parsePublicQuery } from '../../../../_shared/route';
import { readKnowledgePageByUrl } from '@/server/services/agent-memory-documents';

/**
 * @openapi
 * @summary Read next-wiki knowledge by reader URL
 * @description Resolves a same-origin reader URL or relative address with the normal reader routing rules. Requires a bound integration key and retains page permissions, space grants, forgotten-record filtering, bounded content, and revision citations.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @queryParams AgentMemoryWikiPageResolveQuery
 * @response AgentMemoryWikiPage
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = parsePublicQuery(request, agentMemoryWikiPageResolveInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await readKnowledgePageByUrl(ctx, parsed.data.url, parsed.data.maxChars));
});
