import { NextResponse, type NextRequest } from 'next/server';
import { aiQuestionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createWikiQuestion, createWikiToolChat } from '@/server/services/ai-question';

/** @openapi @summary Ask a grounded Wiki question @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiQuestionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  const { tools, ...question } = parsed.data;
  try {
    const ctx = await createApiContext();
    // 026: additive tool-enabled chat. Falls back to ordinary Q&A when tools
    // are unavailable or the selected model cannot call tools (recoverable).
    if (tools?.enabled) {
      const result = await createWikiToolChat(ctx, {
        question: question.question,
        requestedReview: tools.requestedReview ?? 'none',
        currentPage: question.currentPage,
      });
      if (!result.fallback) {
        return NextResponse.json(result.action, { status: 202 });
      }
    }
    return NextResponse.json(await createWikiQuestion(ctx, question), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
