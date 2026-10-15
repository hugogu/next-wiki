import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { toHistoryRevision } from '@/server/api/history-revision';
import * as pages from '@/server/services/pages';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  pageId: z.string().uuid(),
  version: z.coerce.number().int().min(1).max(2_147_483_647),
});

/**
 * Read one revision for the Version history view.
 *
 * @openapi
 * @summary Get a page revision for Version history
 * @description Returns one revision's Markdown source and rendered HTML, with the frontmatter line offset the preview diff needs. The Version history page loads revisions here as they are selected instead of re-rendering the whole page. Applies the same read and draft visibility as the history page itself. Session only; not callable with a Bearer key.
 * @tag Pages
 * @pathParams PageRevisionViewPathParams
 * @response HistoryRevisionView
 */
export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string; version: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError('BAD_REQUEST', 'Invalid page id or version', 400);
  try {
    const revision = await pages.getRevisionByPageId(
      await createApiContext(),
      parsedParams.data.pageId,
      parsedParams.data.version,
    );
    if (!revision) return apiError('NOT_FOUND', 'Revision not found', 404);
    return NextResponse.json(toHistoryRevision(revision), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
