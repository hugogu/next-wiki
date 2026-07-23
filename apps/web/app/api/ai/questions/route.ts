import { NextResponse, type NextRequest } from 'next/server';
import { aiQuestionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { logger } from '@/server/logger';
import { createToolEnabledWikiQuestion, createWikiQuestion } from '@/server/services/ai-question';

/** @openapi @summary Ask a grounded Wiki question @tag AI @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(aiQuestionInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  const { tools, sessionId, ...question } = parsed.data;
  try {
    const ctx = await createApiContext();
    const requestMetadata = {
      origin: 'web',
      ...(sessionId ? { webSessionId: sessionId } : {}),
    };
    // 026: additive tool-enabled question handling. Falls back to ordinary Q&A when tools
    // are unavailable or the selected model cannot call tools (recoverable).
    if (tools?.enabled) {
      const result = await createToolEnabledWikiQuestion(ctx, {
        question: question.question,
        mode: question.mode,
        requestedReview: tools.requestedReview ?? 'none',
        currentPage: question.currentPage,
        conversation: question.conversation,
        requestMetadata,
      });
      if (!result.fallback) {
        return NextResponse.json(result.action, { status: 202 });
      }
    }
    return NextResponse.json(await createWikiQuestion(ctx, { ...question, requestMetadata }), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.warn('Wiki AI action creation rejected', { code: error.code });
      return mapDomainError(error);
    }
    logger.error('Wiki AI action creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
