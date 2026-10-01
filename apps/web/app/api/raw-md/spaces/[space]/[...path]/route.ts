import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getCurrentActor } from '@/server/services/auth';
import { getSpaceRawMarkdown } from '@/server/services/raw-markdown-export';

/**
 * @openapi
 * @summary Get a generated or raw space page's source
 * @description Returns the latest revision's raw source for a page in the generated or raw content space; available only in LLM Wiki mode. A raw entry whose content is not Markdown returns 415. Administrator session only; not callable with a Bearer key.
 * @tag Pages
 * @pathParams SpaceRawMarkdownPathParams
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ space: string; path?: string[] }> }) {
  const { space, path: rawSegments = [] } = await params;
  const path = rawSegments.map(decodeURIComponent).join('/');
  const actor = await getCurrentActor();
  const result = await getSpaceRawMarkdown(space, path, actor);
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
