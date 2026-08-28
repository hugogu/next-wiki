import { NextResponse, type NextRequest } from 'next/server';
import { demoModeUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { getDemoModeView, setDemoReadOnlyMode } from '@/server/services/demo-mode';

/**
 * @openapi
 * @summary Get demo-readonly mode state
 * @description Returns whether the public read-only demo mode is currently active.
 * @tag Site Settings
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await getDemoModeView(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Toggle demo-readonly mode
 * @description Enables or disables the public read-only demo mode. Always permitted for admins, even while the mode is currently active.
 * @tag Site Settings
 * @auth bearer
 * @body DemoModeUpdate
 */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(demoModeUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const enabled = await setDemoReadOnlyMode(await createApiContext(), parsed.data.enabled);
    return NextResponse.json({ enabled });
  } catch (error) {
    return handleApiError(error);
  }
}
