import { NextResponse, type NextRequest } from 'next/server';
import { setupSamplePagesInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { generateSamplePages, skipSamplePages } from '@/server/services/setup-sample-pages';

export const dynamic = 'force-dynamic';

/**
 * Sample and help page generation during first-run onboarding.
 *
 * @openapi
 * @summary Generate or skip sample pages
 * @description Generates the optional welcome, Markdown syntax, and main features pages as normal published wiki pages (idempotent, collision-safe), or records the skip choice. Requires the signed-in initial Admin.
 * @tag Setup
 * @auth bearer
 * @body SetupSamplePagesInput
 * @response SetupSamplePagesResult
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(setupSamplePagesInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const ctx = await createApiContext();
    const result =
      parsed.data.mode === 'skip'
        ? await skipSamplePages(ctx.actor)
        : await generateSamplePages(ctx.actor);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
