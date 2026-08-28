import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { getMyEntitlements } from '@/server/services/ai-entitlements';

/** @openapi @summary Get my effective AI entitlement @tag AI @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await getMyEntitlements(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
