import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getWikiRawMarkdown } from '@/server/services/raw-markdown-export';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: rawSegments = [] } = await params;
  const segments = rawSegments.map(decodeURIComponent);
  const result = await getWikiRawMarkdown(segments);
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
