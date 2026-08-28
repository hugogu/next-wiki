import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { listModels } from '@/server/services/ai-admin';

/** @openapi @summary List AI models @tag AI Admin @auth bearer */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      items: await listModels(await createApiContext(), request.nextUrl.searchParams.get('providerId') ?? undefined),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
