import { hermesMemoryEvidenceInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../_shared/route';
import { submitEvidenceCapture } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Queue Hermes evidence capture
 * @description Queues an idempotent evidence capture. Clients must poll the returned capture URL before claiming a strict checkpoint is durable.
 * @tag Hermes Memory
 * @body HermesMemoryEvidenceInput
 * @response 202:HermesMemoryEvidenceQueued
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, hermesMemoryEvidenceInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await submitEvidenceCapture(ctx, parsed.data);
  return publicJson({
    captureId: result.captureId,
    status: result.status,
    pollUrl: `/api/v1/hermes/memory/evidence/${result.captureId}`,
    idempotent: result.idempotent,
  }, { status: result.idempotent ? 200 : 202 });
});
