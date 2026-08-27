import { assertSupportedProvider, publicJson, withPublicApi } from '../../_shared';
import { getEvidenceCapture } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Poll Hermes evidence capture
 * @description Returns the durable, pending, or failed state for a capture in the calling API key's bound destination.
 * @tag Hermes Memory
 * @response HermesMemoryEvidenceStatus
 */
export const GET = withPublicApi<{ captureId: string }>(async (request, { params }, ctx) => {
  assertSupportedProvider(request);
  return publicJson(await getEvidenceCapture(ctx, (await params).captureId));
});
