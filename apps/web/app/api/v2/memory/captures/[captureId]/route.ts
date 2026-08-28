import { z } from 'zod';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../../_shared';
import { validationError } from '@/server/api/public-errors';
import { getEvidenceCapture } from '@/server/services/agent-memory';

const paramsSchema = z.object({ captureId: z.string().uuid() });

export const GET = withPublicApi<{ captureId: string }>(async (request, { params }, ctx) => {
  assertSupportedMemoryClient(request);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await getEvidenceCapture(ctx, parsedParams.data.captureId));
});
