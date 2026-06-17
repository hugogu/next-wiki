import { NextResponse } from 'next/server';
import { newDraftBodySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { slugParamSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
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
    const view = await pageService.getForEdit(ctx, parsed.data);
    if (!view) {
      return apiError('NOT_FOUND', 'Page not found', 404);
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await createApiContext();
  const { slug } = await params;
  const parsedSlug = parseParams(slugParamSchema, slug);
  if (!parsedSlug.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedSlug.error), 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(newDraftBodySchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await pageService.newDraft(ctx, {
      slug: parsedSlug.data,
      ...parsedBody.data,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
