import { NextResponse, type NextRequest } from 'next/server';
import { setupAiBootstrapInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { configureAiBootstrap, skipAiBootstrap } from '@/server/services/setup-ai';

export const dynamic = 'force-dynamic';

/**
 * OpenRouter AI bootstrap during first-run onboarding.
 *
 * @openapi
 * @summary Configure or skip AI bootstrap
 * @description Configures optional OpenRouter AI bootstrap (validated key, provider registration, background model sync) or skips AI setup. Requires the signed-in initial Admin. The API key is write-only and never returned.
 * @tag Setup
 * @auth bearer
 * @body SetupAiBootstrapInput
 * @response SetupAiBootstrapResult
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(setupAiBootstrapInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const ctx = await createApiContext();
    const result =
      parsed.data.mode === 'skip'
        ? await skipAiBootstrap(ctx.actor)
        : await configureAiBootstrap(ctx.actor, {
            apiKey: parsed.data.apiKey,
            autoAssign: parsed.data.autoAssign,
          });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
