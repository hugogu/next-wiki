import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { applyProposal } from '@/server/services/ai-tool-proposals';

const idSchema = z.string().uuid();
type Params = { params: Promise<{ id: string }> };

/** @openapi @summary Apply an approved AI tool change proposal @tag AI Tools @auth bearer */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await applyProposal(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
