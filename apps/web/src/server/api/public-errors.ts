import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from '@/server/errors';

export type PublicApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'STALE_REVISION'
  | 'PAGE_PATH_CONFLICT'
  | 'REVISION_ALREADY_PUBLISHED'
  | 'UNSUPPORTED_ASSET_TYPE'
  | 'ASSET_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INDEX_NOT_READY'
  | 'INTERNAL_ERROR';

export type PublicApiErrorBody = {
  code: PublicApiErrorCode;
  message: string;
};

export function publicApiError(code: PublicApiErrorCode, message: string, status: number): NextResponse<PublicApiErrorBody> {
  return NextResponse.json({ code, message }, { status });
}

export function validationError(error: ZodError): NextResponse<PublicApiErrorBody> {
  const message = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return publicApiError('VALIDATION_FAILED', message, 422);
}

export function mapPublicDomainError(error: DomainError): NextResponse<PublicApiErrorBody> {
  switch (error.code) {
    case 'UNAUTHORIZED':
      return publicApiError('UNAUTHORIZED', error.message, 401);
    case 'FORBIDDEN':
      return publicApiError('FORBIDDEN', error.message, 403);
    case 'NOT_FOUND':
      return publicApiError('NOT_FOUND', error.message, 404);
    case 'CONFLICT':
      return publicApiError('CONFLICT', error.message, 409);
    case 'STALE_REVISION':
      return publicApiError('STALE_REVISION', error.message, 409);
    case 'REVISION_ALREADY_PUBLISHED':
      return publicApiError('REVISION_ALREADY_PUBLISHED', error.message, 409);
    case 'INVALID_IMAGE':
      return publicApiError('UNSUPPORTED_ASSET_TYPE', error.message, 415);
    case 'INPUT_TOO_LARGE':
    case 'ARCHIVE_TOO_LARGE':
      return publicApiError('ASSET_TOO_LARGE', error.message, 413);
    case 'RATE_LIMITED':
      return publicApiError('RATE_LIMITED', error.message, 429);
    case 'INDEX_NOT_READY':
      return publicApiError('INDEX_NOT_READY', error.message, 409);
    default:
      return publicApiError('VALIDATION_FAILED', error.message, 422);
  }
}
