import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, versionParamSchema, parseParams, getPathFromParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[]; n: string }> }) {
  const ctx = await createApiContext();
  const raw = await params;

  const parsedPath = parseParams(pathParamSchema, raw.path);
  if (!parsedPath.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedPath.error), 400);
  }

  const parsedVersion = parseParams(versionParamSchema, raw.n);
  if (!parsedVersion.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedVersion.error), 400);
  }

  const path = getPathFromParams(raw);

  try {
    const revision = await pageService.getRevision(ctx, path, parsedVersion.data);
    if (!revision) {
      return apiError('NOT_FOUND', 'Revision not found', 404);
    }
    return NextResponse.json(revision);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
