import { NextResponse } from 'next/server';
import { newDraftBodySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, parseParams, getPathFromParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsed = parseParams(pathParamSchema, raw.path);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  const path = getPathFromParams(raw);

  try {
    const view = await pageService.getForEdit(ctx, path);
    if (!view) {
      return apiError('NOT_FOUND', 'Page not found', 404);
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsedPath = parseParams(pathParamSchema, raw.path);
  if (!parsedPath.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedPath.error), 400);
  }

  const path = getPathFromParams(raw);

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(newDraftBodySchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await pageService.newDraft(ctx, path, parsedBody.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
