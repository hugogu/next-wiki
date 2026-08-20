import { z } from 'zod';
import { parsePublicQuery, publicJson, withPublicApi } from '../../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid(), addressId: z.string().uuid() });
const deleteQuerySchema = z.object({ confirmBreakingPublicLinks: z.enum(['true']).optional() });

/**
 * Remove one of a page's addresses.
 *
 * @openapi
 * @summary Remove a page address
 * @description A manually added alias (kind=manual) is removed immediately with edit permission. A retained alias (kind=retained) additionally requires space-manage permission and ?confirmBreakingPublicLinks=true; without it, returns 409 ADDRESS_ALIAS_RETAINED stating the consequence.
 * @tag Pages
 * @auth bearer
 * @queryParams PageAddressDeleteQuery
 * @response PageAddressRemoveResult
 * @response 409:ADDRESS_ALIAS_RETAINED
 */
export const DELETE = withPublicApi<{ id: string; addressId: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsedQuery = parsePublicQuery(request, deleteQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;
  const result = await publicContent.removePageAddressAlias(ctx, parsedParams.data.id, parsedParams.data.addressId, {
    confirmBreakingPublicLinks: parsedQuery.data.confirmBreakingPublicLinks === 'true',
  });
  return publicJson(result);
});
