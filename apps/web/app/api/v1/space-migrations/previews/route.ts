import { spaceMigrationPreviewInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../_shared/route';
import { previewCrossSpaceMigration } from '@/server/services/cross-space-migrations';

/**
 * @openapi
 * @summary Preview a cross-space page or folder migration
 * @tag Space migrations
 * @auth bearer
 * @body SpaceMigrationPreviewInput
 * @response 201:SpaceMigrationPreview
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  const body = await parsePublicJson(request, spaceMigrationPreviewInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await previewCrossSpaceMigration(ctx, body.data), { status: 201 });
});
