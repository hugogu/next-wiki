import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { discardGeneratedArtifact, getGeneratedArtifact } from '@/server/services/ai-artifacts';

const idSchema = z.string().uuid();

/** @openapi @summary Preview a private generated image @tag AI @auth bearer */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const artifact = await getGeneratedArtifact(await createApiContext(), id);
    return new Response(artifact.bytes, {
      headers: {
        'content-type': artifact.contentType,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Discard a private generated image @tag AI @auth bearer */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await discardGeneratedArtifact(await createApiContext(), id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
