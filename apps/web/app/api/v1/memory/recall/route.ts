import { agentMemoryRecallInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../_shared/route';
import { recall } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Recall Agent memory records
 * @description Searches only records in the API key's bound memory destination and agent identity.
 * @tag Agent Memory
 * @body AgentMemoryRecallInput
 * @response AgentMemoryRecallResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, agentMemoryRecallInputSchema);
  if (!parsed.ok) return parsed.response;
  const limit = parsed.data.limit ?? 5;
  const scope = parsed.data.scope ?? 'own';
  const results = await recall(ctx, parsed.data.query, limit, scope);
  return publicJson({
    results,
    retrieval: { mode: 'lexical', complete: true, returned: results.length },
  });
});
