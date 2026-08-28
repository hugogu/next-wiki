import { NextResponse, type NextRequest } from 'next/server';
import { aiRuntimeSettingsUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { getAiRuntimeSettings, updateAiRuntimeSettings } from '@/server/services/ai-runtime-settings';

/**
 * @openapi
 * @summary Get Wiki AI runtime settings
 * @description Available to authenticated users; updates remain administrator-only.
 * @tag AI Admin
 * @auth bearer
 * @response WikiAiRuntimeSettingsView
 */
export async function GET() {
  try {
    return NextResponse.json(await getAiRuntimeSettings(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Update Wiki AI runtime settings
 * @tag AI Admin
 * @auth bearer
 * @body WikiAiRuntimeSettingsUpdate
 * @response WikiAiRuntimeSettingsView
 */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(aiRuntimeSettingsUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateAiRuntimeSettings(await createApiContext(), parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}
