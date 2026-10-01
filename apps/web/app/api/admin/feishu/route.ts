import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { getConfigView } from '@/server/services/feishu-config';

/**
 * Internal administrator endpoint; Feishu credentials are always write-only.
 *
 * @openapi
 * @summary Get the Feishu integration configuration
 * @description Returns the Feishu integration settings. Credentials are write-only and never returned. Session-only; not callable with a Bearer key.
 * @tag Feishu Admin
 */
export async function GET() {
  try {
    return NextResponse.json(await getConfigView(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
