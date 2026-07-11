import { NextResponse, type NextRequest } from 'next/server';
import { updateSearchSettingsInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { readSearchSettings, updateSearchSettings } from '@/server/services/search-settings';

/** @openapi @summary Get search settings @tag Search Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await readSearchSettings(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Update search settings @tag Search Admin @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(updateSearchSettingsInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSearchSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
