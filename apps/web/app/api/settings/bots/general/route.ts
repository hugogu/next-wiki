import { NextResponse, type NextRequest } from 'next/server';
import { updateBotGeneralSettingsSchema } from '@next-wiki/shared';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { readBotGeneralSettings, updateBotGeneralSettings } from '@/server/services/bot-settings';

/**
 * @openapi
 * @summary Get general bot settings
 * @tag Bot Admin
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await readBotGeneralSettings(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update general bot settings
 * @tag Bot Admin
 * @auth bearer
 */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(updateBotGeneralSettingsSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateBotGeneralSettings(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
