import { hermesMemoryRecallInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../_shared/route';
import { recall } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Recall Hermes memory records
 * @description Searches only records in the API key's bound Hermes destination.
 * @tag Hermes Memory
 * @body HermesMemoryRecallInput
 * @response HermesMemoryRecallResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, hermesMemoryRecallInputSchema);
  if (!parsed.ok) return parsed.response;
  const limit = parsed.data.limit ?? 5;
  const results = await recall(ctx, parsed.data.query, limit);
  return publicJson({
    results,
    retrieval: { mode: 'lexical', complete: true, returned: results.length },
  });
});
