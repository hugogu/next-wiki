import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { readWebResearchSettings, updateWebResearchSettings, webResearchSettingsUpdateSchema } from '@/server/web-research/admin';

/** @openapi @summary Get Web Research settings @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await readWebResearchSettings(await createApiContext()));
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}

/** @openapi @summary Update Web Research settings @tag AI Admin @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(webResearchSettingsUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateWebResearchSettings(await createApiContext(), parsed.data));
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
