import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiArtifactPromotionSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { promoteGeneratedArtifact } from '@/server/services/ai-artifacts';

const idSchema = z.string().uuid();

/** @openapi @summary Promote a generated image into a Wiki asset @tag AI @auth bearer */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  const parsed = parseJson(aiArtifactPromotionSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await promoteGeneratedArtifact(await createApiContext(), id, parsed.data.pageId));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
