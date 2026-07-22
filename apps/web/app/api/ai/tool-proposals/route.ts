import { NextResponse, type NextRequest } from 'next/server';
import { aiToolProposalListQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseQuery } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listProposals } from '@/server/services/ai-tool-proposals';

/** @openapi @summary List AI tool change proposals @tag AI Tools @auth bearer */
export async function GET(request: NextRequest) {
  const parsed = parseQuery(aiToolProposalListQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await listProposals(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
