import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getWikiRawMarkdown } from '@/server/services/raw-markdown-export';

/**
 * @openapi
 * @summary Get a public wiki page's Markdown source
 * @description Returns the current revision's raw Markdown for the page the HTML reader would show at the same address, so a page's Markdown URL is its reader URL plus `.md` (for example `/wiki/guides-setup.md`). The address is resolved by the same rules as the reader — space route prefix, optional translation locale, then the page's canonical slug or one of its retained or manual aliases. A page's old tree-path address (`/guides/setup.md`) still resolves when it matches no public address. No authentication; only pages anonymous readers can see resolve.
 * @tag Pages
 * @pathParams WikiRawMarkdownPathParams
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  // Segments stay percent-encoded: the reader resolver decodes them exactly
  // once, and decoding here as well would turn a literal `%` into a 500.
  const { path: segments = [] } = await params;
  const result = await getWikiRawMarkdown(segments);
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
