import { hermesMemoryForgetInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../../_shared';
import { parseOptionalPublicJson } from '../../../../_shared/route';
import { forget } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Forget a Hermes memory record
 * @description Soft-deletes a record only when it belongs to the calling API key's bound destination.
 * @tag Hermes Memory
 * @body HermesMemoryForgetInput
 * @response HermesMemoryForgetResponse
 */
export const DELETE = withPublicApi<{ memoryId: string }>(async (request, { params }, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parseOptionalPublicJson(request, hermesMemoryForgetInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await forget(ctx, (await params).memoryId));
});
