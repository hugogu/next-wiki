import { NextResponse, type NextRequest } from 'next/server';
import { aiSettingsUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { readSettings, updateSettings } from '@/server/services/ai-admin';

/** @openapi @summary Get AI settings @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await readSettings(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Update AI settings @tag AI Admin @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(aiSettingsUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
