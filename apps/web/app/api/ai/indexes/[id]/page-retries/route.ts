import { NextResponse, type NextRequest } from 'next/server';
import { aiIndexRetrySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { retryIndexPages } from '@/server/services/ai-index';

/** @openapi @summary Retry AI index pages @tag AI Admin @auth bearer */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = parseJson(aiIndexRetrySchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await retryIndexPages(await createApiContext(), (await params).id, parsed.data.pageIds ?? []), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
