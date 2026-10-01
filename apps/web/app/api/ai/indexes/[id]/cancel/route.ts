import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { cancelIndexGeneration } from '@/server/services/ai-index';

/**
 * @openapi
 * @summary Cancel building AI index
 * @tag AI Admin
 * @auth bearer
 * @pathParams AiIndexIdPathParams
 * @response 204
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await cancelIndexGeneration(await createApiContext(), (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
