import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { getUsageStats } from '@/server/services/ai-actions';

/** @openapi @summary AI usage statistics @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await getUsageStats(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
