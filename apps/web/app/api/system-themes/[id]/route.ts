import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { updateSystemThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteSystemTheme, getSystemTheme, updateSystemTheme } from '@/server/services/system-theme';

const idSchema = z.string().uuid();

/**
 * @openapi
 * @summary Get a system theme
 * @description Returns the full system theme (id, name, css, isBuiltin). Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await getSystemTheme(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update a system theme
 * @description Updates a custom theme's name and/or CSS. Built-ins are read-only. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 * @body UpdateSystemThemeInput
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  const parsed = parseJson(updateSystemThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSystemTheme(await createApiContext(), id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Delete a system theme
 * @description Deletes a custom theme. Built-ins cannot be deleted. If the deleted theme was active, the active pointer is cleared. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteSystemTheme(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
