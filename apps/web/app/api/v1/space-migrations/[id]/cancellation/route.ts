import { z } from 'zod';
import { publicJson, withPublicApi } from '../../../_shared/route';
import { cancelCrossSpaceMigration } from '@/server/services/cross-space-migrations';

const paramsSchema = z.object({ id: z.string().uuid() });
/**
 * @openapi
 * @summary Cancel a queued or running cross-space migration
 * @tag Space migrations
 * @auth bearer
 * @response SpaceMigrationOperation
 */
export const POST = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404 });
  return publicJson(await cancelCrossSpaceMigration(ctx, parsed.data.id), { status: 202 });
});
