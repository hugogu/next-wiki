import { NextResponse, type NextRequest } from 'next/server';
import { updateAnalyticsSettingsInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { readAnalyticsSettings, upsertAnalyticsProviders } from '@/server/services/analytics';

export const dynamic = 'force-dynamic';

/**
 * @openapi
 * @summary List analytics providers
 * @description Returns all registered analytics providers with their admin-only configuration and active script content.
 * @tag Analytics
 * @auth bearer
 * @response AnalyticsSettingsView
 */
export async function GET() {
  try {
    return NextResponse.json(await readAnalyticsSettings(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update analytics providers
 * @description Upserts one or more analytics provider configurations. Each provider is updated independently.
 * @tag Analytics
 * @auth bearer
 * @body UpdateAnalyticsSettingsInput
 * @response AnalyticsSettingsView
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateAnalyticsSettingsInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return mapDomainError(new DomainError('BAD_REQUEST', formatZodError(parsed.error)));
  try {
    return NextResponse.json(await upsertAnalyticsProviders(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
