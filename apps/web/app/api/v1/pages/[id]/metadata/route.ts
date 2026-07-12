import { z } from 'zod';
import { publicPageMetadataInputSchema } from '@next-wiki/shared';
import { parsePublicJson, publicJson, withPublicApi } from '../../../_shared/route';
import { validationError } from '@/server/api/public-errors';
import * as publicContent from '@/server/services/public-content';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * @openapi
 * @summary Update typed page metadata
 * @description Creates a draft revision while synchronizing title, date, tags, summary, and Markdown frontmatter.
 * @tag Pages
 * @auth bearer
 * @body PublicPageMetadataInput
 * @response PublicPageResource
 */
export const PATCH = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const body = await parsePublicJson(request, publicPageMetadataInputSchema);
  if (!body.ok) return body.response;
  return publicJson(await publicContent.updatePageMetadata(ctx, parsedParams.data.id, body.data));
});
