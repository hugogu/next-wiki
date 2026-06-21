import { NextResponse, type NextRequest } from 'next/server';
import { aiSearchInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createSemanticSearch } from '@/server/services/ai-retrieval';

/** @openapi @summary Start semantic Wiki search @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiSearchInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createSemanticSearch(await createApiContext(), {
      query: parsed.data.query,
      limit: parsed.data.limit ?? 10,
    }), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
