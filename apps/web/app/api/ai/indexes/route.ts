import { NextResponse, type NextRequest } from 'next/server';
import { aiIndexCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createIndexRebuild, listIndexes } from '@/server/services/ai-index';

/** @openapi @summary List AI indexes @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json({ items: await listIndexes(await createApiContext()) });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
/** @openapi @summary Start AI index rebuild @tag AI Admin @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiIndexCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createIndexRebuild(await createApiContext(), parsed.data.reason), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
