import { spaceMigrationConfirmInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../_shared/route';
import { confirmCrossSpaceMigration } from '@/server/services/cross-space-migrations';

/**
 * @openapi
 * @summary Start a reviewed cross-space migration
 * @tag Space migrations
 * @auth bearer
 * @body SpaceMigrationConfirmInput
 * @response SpaceMigrationOperation
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const body = await parsePublicJson(request, spaceMigrationConfirmInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await confirmCrossSpaceMigration(ctx, body.data), { status: 202 });
});
