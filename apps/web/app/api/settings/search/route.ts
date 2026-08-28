import { NextResponse, type NextRequest } from 'next/server';
import { updateSearchSettingsInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { readSearchSettings, updateSearchSettings } from '@/server/services/search-settings';

/** @openapi @summary Get search settings @description Available to authenticated users; updates remain administrator-only. @tag Search Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await readSearchSettings(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}

/** @openapi @summary Update search settings @tag Search Admin @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(updateSearchSettingsInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSearchSettings(await createApiContext(), parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}
