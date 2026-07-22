import { NextResponse, type NextRequest } from 'next/server';
import { aiToolPolicyUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { updateToolPolicy } from '@/server/services/ai-tool-policy';

/** @openapi @summary Update an AI tool policy @tag AI Tools @auth bearer */
export async function PATCH(request: NextRequest) {
  const parsed = parseJson(aiToolPolicyUpdateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateToolPolicy(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
