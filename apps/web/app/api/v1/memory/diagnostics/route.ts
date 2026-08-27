import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { getDiagnostics } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Diagnose Agent memory access
 * @description Performs an authenticated, non-secret destination and scope check. It does not expose credentials or response bodies.
 * @tag Agent Memory
 * @response AgentMemoryDiagnostics
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  return publicJson(await getDiagnostics(ctx));
});
