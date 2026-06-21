import { NextResponse, type NextRequest } from 'next/server';
import { aiImageInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createImageGeneration } from '@/server/services/ai-image-generation';

/** @openapi @summary Generate a private Wiki illustration preview @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiImageInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createImageGeneration(await createApiContext(), parsed.data), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
