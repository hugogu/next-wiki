import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { slugParamSchema, versionParamSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; n: string }> }) {
  const ctx = await createApiContext();
  const { slug, n } = await params;

  const parsedSlug = parseParams(slugParamSchema, slug);
  if (!parsedSlug.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedSlug.error), 400);
  }

  const parsedVersion = parseParams(versionParamSchema, n);
  if (!parsedVersion.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedVersion.error), 400);
  }

  try {
    const revision = await pageService.getRevision(ctx, parsedSlug.data, parsedVersion.data);
    if (!revision) {
      return apiError('NOT_FOUND', 'Revision not found', 404);
    }
    return NextResponse.json(revision);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
