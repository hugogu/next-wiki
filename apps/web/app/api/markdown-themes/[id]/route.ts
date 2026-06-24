import { NextResponse, type NextRequest } from 'next/server';
import { updateMarkdownThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteTheme, getTheme, updateTheme } from '@/server/services/markdown-themes';

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(params: Ctx['params']) {
  const { id } = await params;
  return parseParams(uuidSchema, id);
}

/**
 * @openapi
 * @summary Get a Markdown theme
 * @description Returns the full stylesheet content of a theme the caller may view.
 * @tag Appearance
 * @auth bearer
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const parsed = await resolveId(params);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await getTheme(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update a Markdown theme
 * @description Updates a personal theme's name and/or CSS. Built-ins are read-only.
 * @tag Appearance
 * @auth bearer
 * @body UpdateMarkdownThemeInput
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const parsedId = await resolveId(params);
  if (!parsedId.ok) return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);
  const parsed = parseJson(updateMarkdownThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateTheme(await createApiContext(), parsedId.data, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Delete a Markdown theme
 * @description Deletes a personal theme. If it was active, the caller falls back to Default.
 * @tag Appearance
 * @auth bearer
 * @response 204
 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const parsed = await resolveId(params);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    await deleteTheme(await createApiContext(), parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
