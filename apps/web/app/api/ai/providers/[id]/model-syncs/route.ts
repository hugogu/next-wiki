import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { syncProviderModelsNow } from '@/server/services/ai-admin';

/**
 * Synchronize a capability's model catalog immediately.
 *
 * @openapi
 * @summary Synchronize AI models
 * @tag AI Admin
 * @auth bearer
 * @response AiModelSyncResult
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await syncProviderModelsNow(
      await createApiContext(),
      (await params).id,
    ));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
