import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getCurrentActor } from '@/server/services/auth';
import { getWikiRawMarkdown } from '@/server/services/raw-markdown-export';

/**
 * @openapi
 * @summary Get a public wiki page's Markdown source
 * @description Returns the current revision's raw Markdown for the page the HTML reader would show at the same address, so a page's Markdown URL is its reader URL plus `.md` (for example `/wiki/guides-setup.md`). The address is resolved by the same rules as the reader — space route prefix, optional translation locale, then the page's canonical slug or one of its retained or manual aliases. A page's old tree-path address (`/guides/setup.md`) still resolves when it matches no public address. Uses the current login session and the same read permissions as the HTML reader; without a session, only publicly readable pages resolve.
 * @tag Pages
 * @pathParams WikiRawMarkdownPathParams
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  // Next has already percent-decoded these segments. Decoding them again would
  // throw on a literal `%` (`/x%25y.md`) and answer 500 instead of 404.
  const { path: segments = [] } = await params;
  const result = await getWikiRawMarkdown(segments, { actor: await getCurrentActor() });
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
