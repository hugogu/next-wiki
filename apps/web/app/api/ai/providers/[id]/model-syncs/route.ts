import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { startProviderModelSync } from '@/server/services/ai-admin';

/**
 * Synchronize a provider's model catalog. Detector-backed providers get a
 * queued (or resumed) `model_sync` action returned with 202 Accepted so the
 * request is never blocked by per-model schema enrichment; other providers
 * sync inline and return the result directly. Admin-only via manage_ai.
 *
 * @openapi
 * @summary Synchronize AI models
 * @tag AI Admin
 * @auth bearer
 * @response AiModelSyncResult
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const outcome = await startProviderModelSync(await createApiContext(), (await params).id);
    if (outcome.mode === 'action') {
      return NextResponse.json(outcome.action, { status: 202 });
    }
    return NextResponse.json(outcome.result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
