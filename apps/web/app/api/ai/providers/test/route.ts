import { NextResponse, type NextRequest } from 'next/server';
import { aiProviderTestSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { testProviderConnection } from '@/server/services/ai-admin';

/** @openapi @summary Test an AI provider connection synchronously @tag AI Admin @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiProviderTestSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await testProviderConnection(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
