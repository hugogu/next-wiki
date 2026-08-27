import { z } from 'zod';
import { assertSupportedProvider, publicJson, withPublicApi } from '../../_shared';
import { validationError } from '@/server/api/public-errors';
import { getEvidenceCapture } from '@/server/services/hermes-memory';

const paramsSchema = z.object({ captureId: z.string().uuid() });

/**
 * @openapi
 * @summary Poll Hermes evidence capture
 * @description Returns the durable, pending, or failed state for a capture in the calling API key's bound destination.
 * @tag Hermes Memory
 * @response HermesMemoryEvidenceStatus
 */
export const GET = withPublicApi<{ captureId: string }>(async (request, { params }, ctx) => {
  assertSupportedProvider(request);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await getEvidenceCapture(ctx, parsedParams.data.captureId));
});
