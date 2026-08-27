import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { getConnection } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Inspect Hermes memory connection
 * @description Returns only the bound memory namespace and enabled capabilities. Requires a Hermes-scoped Bearer API key and the provider version header.
 * @tag Hermes Memory
 * @response HermesMemoryConnection
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  return publicJson(await getConnection(ctx));
});
