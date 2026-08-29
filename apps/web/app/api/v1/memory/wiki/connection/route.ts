import { assertSupportedProvider, publicJson, withPublicApi } from '../../_shared';
import { getMirrorConnection } from '@/server/services/agent-memory-documents';

/**
 * @openapi
 * @summary Inspect the bound Memory Wiki mirror connection
 * @description Returns content-free mirror capabilities for the API key's bound destination.
 * @tag Agent Memory Wiki
 * @auth bearer
 * @response AgentMemoryWikiConnection
 */
export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  return publicJson(await getMirrorConnection(ctx));
});
