import { agentMemoryV2RecallInputSchema } from '@next-wiki/shared';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../v1/_shared/route';
import { recallV2 } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Recall Agent Memory v2 records
 * @description Searches own or owner-granted destinations selected by server policy; clients cannot submit destination identifiers.
 * @tag Agent Memory
 * @body AgentMemoryV2RecallInput
 * @response AgentMemoryV2RecallResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  const parsed = await parsePublicJson(request, agentMemoryV2RecallInputSchema);
  if (!parsed.ok) return parsed.response;
  const results = await recallV2(ctx, parsed.data);
  return publicJson({ results, retrieval: { mode: 'lexical', complete: true, returned: results.length } });
});
