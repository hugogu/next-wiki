import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { deleteIndexGeneration, getIndex } from '@/server/services/ai-index';

/** @openapi @summary Get AI index @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getIndex(await createApiContext(), (await params).id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Delete AI index @tag AI Admin @auth bearer */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deleteIndexGeneration(await createApiContext(), (await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
