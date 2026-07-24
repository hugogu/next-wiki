import type { NextRequest } from 'next/server';
import { rawMarkdownResultToResponse } from '@/lib/raw-markdown-response';
import { getCurrentActor } from '@/server/services/auth';
import { getSpaceRawMarkdown } from '@/server/services/raw-markdown-export';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ space: string; path?: string[] }> }) {
  const { space, path: rawSegments = [] } = await params;
  const path = rawSegments.map(decodeURIComponent).join('/');
  const actor = await getCurrentActor();
  const result = await getSpaceRawMarkdown(space, path, actor);
  return rawMarkdownResultToResponse(result);
}

export const dynamic = 'force-dynamic';
