import { NextResponse, type NextRequest } from 'next/server';
import { aiOptimizationInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createTextOptimization } from '@/server/services/ai-optimization';

/** @openapi @summary Optimize selected Wiki Markdown @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiOptimizationInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createTextOptimization(await createApiContext(), {
      ...parsed.data,
      instruction: parsed.data.instruction ?? 'improve_clarity',
    }), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
