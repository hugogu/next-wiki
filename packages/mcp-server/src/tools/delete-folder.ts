import { z } from 'zod';
import { contentSpaceSchema, type WikiApiClient } from '../api-client';
import { deleteFolderResponse } from '../shapes';

export const deleteFolderSchema = {
  pathPrefix: z
    .string()
    .min(1)
    .describe(
      'Tree path prefix to delete (e.g. "raw/garbage" or "docs/old-design"). Every page at or under this path is soft-deleted.',
    ),
  space: contentSpaceSchema
    .optional()
    .describe('Content space slug; defaults to the default wiki space. Pass "raw" to delete a Raw space folder (admin-only).'),
  dryRun: z
    .boolean()
    .optional()
    .describe('If true, returns the affected page count without deleting; defaults to false'),
};
export type DeleteFolderInput = z.infer<z.ZodObject<typeof deleteFolderSchema>>;

export async function deleteFolder(client: WikiApiClient, args: DeleteFolderInput) {
  const response = await client.deleteFolder({
    pathPrefix: args.pathPrefix,
    space: args.space,
    dry_run: args.dryRun ?? false,
  });
  return deleteFolderResponse(response);
}
