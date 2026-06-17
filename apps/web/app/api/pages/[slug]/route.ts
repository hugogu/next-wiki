import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { slugParamSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await createApiContext();
  const { slug } = await params;
  const parsed = parseParams(slugParamSchema, slug);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const page = await pageService.getLive(ctx, parsed.data);
    if (!page) {
      return apiError('NOT_FOUND', 'Page not found', 404);
    }
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
