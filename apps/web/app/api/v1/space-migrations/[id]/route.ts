import { z } from 'zod';
import { publicJson, withPublicApi } from '../../_shared/route';
import { getCrossSpaceMigration } from '@/server/services/cross-space-migrations';

const paramsSchema = z.object({ id: z.string().uuid() });
/**
 * @openapi
 * @summary Get cross-space migration status
 * @tag Space migrations
 * @auth bearer
 * @response SpaceMigrationOperation
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404 });
  return publicJson(await getCrossSpaceMigration(ctx, parsed.data.id));
});
