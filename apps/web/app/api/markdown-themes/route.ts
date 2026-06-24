import { NextResponse, type NextRequest } from 'next/server';
import { createMarkdownThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createTheme, listThemes } from '@/server/services/markdown-themes';

/**
 * @openapi
 * @summary List Markdown themes
 * @description Lists built-in themes plus the caller's personal themes and the active selection.
 * @tag Appearance
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await listThemes(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Create a Markdown theme
 * @description Creates a personal, editable theme by copying an existing theme.
 * @tag Appearance
 * @auth bearer
 * @body CreateMarkdownThemeInput
 */
export async function POST(request: NextRequest) {
  const parsed = parseJson(createMarkdownThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createTheme(await createApiContext(), parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
