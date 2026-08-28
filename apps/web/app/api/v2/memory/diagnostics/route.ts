import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { getDiagnostics } from '@/server/services/agent-memory';

export const GET = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  return publicJson({ ...(await getDiagnostics(ctx)), apiVersion: 'v2' as const });
});
