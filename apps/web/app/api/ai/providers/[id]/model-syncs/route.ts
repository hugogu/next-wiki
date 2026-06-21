import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createProviderAction } from '@/server/services/ai-admin';

/** @openapi @summary Synchronize AI models @tag AI Admin @auth bearer */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(
      await createProviderAction(await createApiContext(), (await params).id, 'model_sync'),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
