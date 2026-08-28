import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listSpaceConfigurations } from '@/server/services/spaces';
import { isLlmWikiMode } from '@/server/services/writing-mode';

export const dynamic = 'force-dynamic';

/** Administrator-facing presentation configuration for all built-in spaces. */
export async function GET() {
  try {
    const ctx = await createApiContext();
    if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
      throw new DomainError('FORBIDDEN', 'You do not have permission to configure spaces');
    }
    const [spaces, llmWikiMode] = await Promise.all([listSpaceConfigurations(), isLlmWikiMode()]);
    return NextResponse.json({
      spaces: spaces.map((space) => ({ ...space, isActive: space.kind === 'wiki' || llmWikiMode })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
