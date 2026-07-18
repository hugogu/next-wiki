import { NextResponse, type NextRequest } from 'next/server';
import { setupWritingModeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { recordWritingMode } from '@/server/services/setup';

export const dynamic = 'force-dynamic';

/**
 * @openapi
 * @summary Select the writing mode during first-run setup
 * @description Records the signed-in initial Admin's one-time Copilot or LLM Wiki choice and advances onboarding to sample-page setup.
 * @tag Setup
 * @auth bearer
 * @body SetupWritingModeInput
 * @response SetupStateView
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(setupWritingModeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);

  try {
    const ctx = await createApiContext();
    return NextResponse.json(await recordWritingMode(ctx.actor, parsed.data.mode));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
