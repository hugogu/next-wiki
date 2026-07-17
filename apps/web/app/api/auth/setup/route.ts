import { NextResponse } from 'next/server';
import { setupInputSchema } from '@next-wiki/shared';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as setupService from '@/server/services/setup';

/**
 * Initial admin setup.
 *
 * @openapi
 * @summary Setup
 * @description Creates the first admin user when the wiki has no users yet, establishes a session, and advances first-run onboarding to the AI step.
 * @tag Auth
 * @body SetupInput
 * @response OkResponse
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(setupInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await setupService.setupAdmin(parsed.data);
    return NextResponse.json({ ok: true, nextStep: 'ai' });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
