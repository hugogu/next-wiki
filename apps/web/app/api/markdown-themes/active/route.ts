import { NextResponse, type NextRequest } from 'next/server';
import { activateMarkdownThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { activateTheme } from '@/server/services/markdown-themes';

/**
 * @openapi
 * @summary Activate a Markdown theme
 * @description Sets the caller's active Markdown reading theme (null ⇒ Default).
 * @tag Appearance
 * @auth bearer
 * @body ActivateMarkdownThemeInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(activateMarkdownThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await activateTheme(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
