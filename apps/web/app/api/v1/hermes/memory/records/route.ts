import { hermesMemorySaveInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../_shared/route';
import { save } from '@/server/services/hermes-memory';

/**
 * @openapi
 * @summary Save a Hermes memory record
 * @description Creates an immutable revision-backed record in the API key's bound destination. Retries with the same idempotency key return the existing record.
 * @tag Hermes Memory
 * @body HermesMemorySaveInput
 * @response 201:HermesMemorySaveResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, hermesMemorySaveInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await save(ctx, parsed.data);
  return publicJson(result, { status: result.idempotent ? 200 : 201 });
});
