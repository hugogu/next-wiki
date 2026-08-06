import { z } from 'zod';
import { parsePublicQuery, publicJson, withPublicApi } from '../../../_shared/route';
import { spaceMigrationItemsQuerySchema } from '@next-wiki/shared';
import { listCrossSpaceMigrationItems } from '@/server/services/cross-space-migrations';

const paramsSchema = z.object({ id: z.string().uuid() });
/**
 * @openapi
 * @summary List per-page cross-space migration outcomes
 * @tag Space migrations
 * @auth bearer
 * @queryParams SpaceMigrationItemsQuery
 */
export const GET = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return new Response(null, { status: 404 });
  const query = parsePublicQuery(request, spaceMigrationItemsQuerySchema);
  if (!query.ok) return query.response;
  return publicJson(await listCrossSpaceMigrationItems(ctx, parsedParams.data.id, query.data.limit, query.data.cursor));
});
