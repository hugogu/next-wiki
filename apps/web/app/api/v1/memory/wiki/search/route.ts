import { agentMemoryWikiSearchInputSchema } from '@next-wiki/shared';
import { parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import { searchKnowledge } from '@/server/services/agent-memory-documents';
import { assertSupportedProvider } from '../../_shared';

/**
 * @openapi
 * @summary Search readable next-wiki knowledge
 * @description Searches the caller's currently permitted Wiki, Raw, and Generated spaces and reports only safe coverage flags.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @queryParams AgentMemoryWikiSearchQuery
 * @response AgentMemoryWikiSearchResponse
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = parsePublicQuery(request, agentMemoryWikiSearchInputSchema.extend({
    limit: agentMemoryWikiSearchInputSchema.shape.limit.default(10),
  }));
  if (!parsed.ok) return parsed.response;
  return publicJson(await searchKnowledge(ctx, parsed.data.q, parsed.data.limit));
});
