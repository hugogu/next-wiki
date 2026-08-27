import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { getConnection } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Inspect Agent memory connection
 * @description Returns only the bound memory namespace and enabled capabilities. Requires a memory-provider Bearer API key and the provider version header.
 * @tag Agent Memory
 * @response AgentMemoryConnection
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  return publicJson(await getConnection(ctx));
});
