import { z } from 'zod';
import { agentMemoryForgetInputSchema, agentMemoryRecordLifecycleInputSchema } from '@next-wiki/shared';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../../_shared';
import { parseOptionalPublicJson } from '../../../../v1/_shared/route';
import { validationError } from '@/server/api/public-errors';
import { forget, updateRecordState } from '@/server/services/agent-memory';

const paramsSchema = z.object({ memoryId: z.string().uuid() });

export const DELETE = withPublicApi<{ memoryId: string }>(async (request, { params }, ctx) => {
  assertSupportedMemoryClient(request);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsed = await parseOptionalPublicJson(request, agentMemoryForgetInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await forget(ctx, parsedParams.data.memoryId));
});

/**
 * @openapi
 * @summary Change Agent Memory recall state
 * @description Reversibly activates, forgets, or archives a memory projection. Canonical Raw evidence is retained.
 * @tag Agent Memory
 * @body AgentMemoryRecordLifecycleInput
 */
export const PATCH = withPublicApi<{ memoryId: string }>(async (request, { params }, ctx) => {
  assertSupportedMemoryClient(request);
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsed = await parseOptionalPublicJson(request, agentMemoryRecordLifecycleInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await updateRecordState(ctx, parsedParams.data.memoryId, parsed.data.state));
});
