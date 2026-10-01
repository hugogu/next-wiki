import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getWikiRawMarkdown } from '@/server/services/raw-markdown-export';

/**
 * @openapi
 * @summary Get a public wiki page's Markdown source
 * @description Returns the current revision's raw Markdown, resolving the reader path (including an optional translation locale prefix) the same way the HTML reader does. No authentication; only pages anonymous readers can see resolve.
 * @tag Pages
 * @pathParams WikiRawMarkdownPathParams
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: rawSegments = [] } = await params;
  const segments = rawSegments.map(decodeURIComponent);
  const result = await getWikiRawMarkdown(segments);
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
