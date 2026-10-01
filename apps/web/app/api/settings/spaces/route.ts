import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listSpaceConfigurations } from '@/server/services/spaces';
import { isLlmWikiMode } from '@/server/services/writing-mode';

export const dynamic = 'force-dynamic';

/**
 * Administrator-facing presentation configuration for all built-in spaces.
 *
 * @openapi
 * @summary List content space configurations
 * @description Returns each built-in content space's route prefix, default page visibility, and whether it is active. Administrator session only; not callable with a Bearer key.
 * @tag Settings
 */
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
