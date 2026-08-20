import { z } from 'zod';
import { publicPageAddressCreateInputSchema } from '@next-wiki/shared';
import { parsePublicJson, parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });
const releaseQuerySchema = z.object({ release: z.enum(['true']).optional() });

/**
 * List a page's canonical address and every alias.
 *
 * @openapi
 * @summary List page addresses
 * @description Returns the page's canonical address plus every retained and manually added alias.
 * @tag Pages
 * @auth bearer
 * @response PublicPageAddressList
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await publicContent.listPageAddresses(parsedParams.data.id));
});

/**
 * Add a manually added alias address to a page.
 *
 * @openapi
 * @summary Add a page address alias
 * @description Registers an additional public address for the page (kind=manual). Requires edit permission on the page.
 * @tag Pages
 * @auth bearer
 * @body PublicPageAddressCreateInput
 * @response 201:PublicPageAddress
 * @response 409:PAGE_ADDRESS_TAKEN
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const body = await parsePublicJson(request, publicPageAddressCreateInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await publicContent.addPageAddressAlias(ctx, parsedParams.data.id, body.data.address), { status: 201 });
});

/**
 * Release every address of a soft-deleted page back to the available pool.
 *
 * @openapi
 * @summary Release a deleted page's addresses
 * @description Space-manage only. Requires ?release=true and that the page is currently soft-deleted; returns 409 PAGE_NOT_DELETED for a live page.
 * @tag Pages
 * @auth bearer
 * @queryParams PageAddressReleaseQuery
 * @response PageAddressReleaseResult
 * @response 409:PAGE_NOT_DELETED
 */
export const DELETE = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsedQuery = parsePublicQuery(request, releaseQuerySchema);
  if (!parsedQuery.ok) return parsedQuery.response;
  if (parsedQuery.data.release !== 'true') {
    return validationError(new z.ZodError([{ code: 'custom', message: 'Provide ?release=true to release addresses', path: ['release'] }]));
  }
  return publicJson(await publicContent.releasePageAddresses(ctx, parsedParams.data.id));
});
