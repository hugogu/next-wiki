import { z } from 'zod';
import { aiAttributionClearanceInputSchema } from '@next-wiki/shared';
import { validationError } from '@/server/api/public-errors';
import { clearAiAttribution, listAiAttributionClearances } from '@/server/services/ai-attribution-clearances';
import { parsePublicJson, publicJson, withPublicApi } from '../../../../_shared/route';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * @openapi
 * @summary Set or clear page AI attribution through a human declaration
 * @description Session-only. The page author or Administrator can set the label to generated or assisted, or clear it after confirming the latest revision. Records the actor, timestamp, revision, version and previous label. API keys cannot perform this operation. Later human or AI revisions may change the effective label.
 * @tag Pages
 * @pathParams PublicPageIdPathParams
 * @body AiAttributionClearanceInput
 * @response 200:AiAttributionClearance
 */
export const POST = withPublicApi<{ id: string }>(async (request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  const parsed = await parsePublicJson(request, aiAttributionClearanceInputSchema);
  if (!parsed.ok) return parsed.response;
  return publicJson(await clearAiAttribution(ctx, parsedParams.data.id, parsed.data));
});

/**
 * @openapi
 * @summary List durable page AI attribution declarations
 * @description Session-only. The page author or Administrator can read recorded clearance times, revisions, versions, actors and previous labels for analysis.
 * @tag Pages
 * @pathParams PublicPageIdPathParams
 * @response 200:AiAttributionClearanceList
 */
export const GET = withPublicApi<{ id: string }>(async (_request, { params }, ctx) => {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return validationError(parsedParams.error);
  return publicJson(await listAiAttributionClearances(ctx, parsedParams.data.id));
});
