import { NextResponse } from 'next/server';
import { registerInputSchema } from '@next-wiki/shared';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as authService from '@/server/services/auth';

/**
 * Register a new account.
 *
 * @openapi
 * @summary Register
 * @description Creates a new user account and establishes a session.
 * @tag Auth
 * @body RegisterInput
 * @response 201:RegisterOutput
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(registerInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    // Read the anonymous capability before the session cookie is created.
    // Registration claims matching server-side actions transactionally; the
    // client only clears its IndexedDB copy after this response succeeds.
    const anonymousAiToken = await authService.getAnonymousAiAccessToken();
    const { userId, migratedActionCount } = await authService.register(parsed.data, anonymousAiToken);
    await authService.establishSession(userId);
    return NextResponse.json({ userId, migratedActionCount }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
