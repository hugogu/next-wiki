import { agentMemoryV2CaptureInputSchema } from '@next-wiki/shared';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../v1/_shared/route';
import { submitEvidenceCapture } from '@/server/services/agent-memory';

export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  const parsed = await parsePublicJson(request, agentMemoryV2CaptureInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await submitEvidenceCapture(ctx, parsed.data);
  return publicJson({
    captureId: result.captureId,
    status: result.status,
    pollUrl: `/api/v2/memory/captures/${result.captureId}`,
    idempotent: result.idempotent,
  }, { status: result.idempotent ? 200 : 202 });
});
