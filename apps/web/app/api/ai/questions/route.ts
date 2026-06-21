import { NextResponse, type NextRequest } from 'next/server';
import { aiQuestionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createWikiQuestion } from '@/server/services/ai-question';

/** @openapi @summary Ask a grounded Wiki question @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiQuestionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createWikiQuestion(await createApiContext(), parsed.data), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
