import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { getV2Connection } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Inspect Agent Memory v2 connection
 * @description Returns stable connection capabilities without destination or grant inventory.
 * @tag Agent Memory
 * @response AgentMemoryV2Connection
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  return publicJson(await getV2Connection(ctx));
});
