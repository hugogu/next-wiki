import { z } from 'zod';
import { agentMemoryForgetInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../../_shared';
import { parseOptionalPublicJson } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import { forget } from '@/server/services/agent-memory';

const paramsSchema = z.object({ memoryId: z.string().uuid() });

/**
 * @openapi
 * @summary Forget an Agent memory record
 * @description Soft-deletes a record only when it belongs to the calling API key's bound destination.
 * @tag Agent Memory
 * @body AgentMemoryForgetInput
 * @response AgentMemoryForgetResponse
 */
export const DELETE = withPublicApi<{ memoryId: string }>(async (request, { params }, ctx) => {
  assertSupportedProvider(request);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsed = await parseOptionalPublicJson(request, agentMemoryForgetInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await forget(ctx, parsedParams.data.memoryId));
});
