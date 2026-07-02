import { z } from 'zod';
import { parsePublicQuery, publicJson, withPublicApi } from '../../../../../_shared/route';
import * as publicContent from '@/server/services/public-content';
import { publicRevisionDiffQuerySchema } from '@next-wiki/shared';

/**
 * Get a structured diff between two revisions.
 *
 * @openapi
 * @summary Get public wiki revision diff
 * @description Returns a unified diff and line counts between the requested version and the `against` version.
 * @tag Revisions
 * @auth bearer
 * @queryParams PublicRevisionDiffQuery
 * @response PublicRevisionDiffResponse
 */
export const GET = withPublicApi<{ id: string; version: string }>(async (request, { params }, ctx) => {
  const { id, version } = await params;
  const parsed = parsePublicQuery(request, publicRevisionDiffQuerySchema);
  if (!parsed.ok) return parsed.response;
  const toVersion = z.coerce.number().int().min(1).parse(version);
  const diff = await publicContent.getDiff(ctx, id, toVersion, parsed.data.against);
  if (!diff) return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Revision(s) not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  return publicJson(diff);
});
