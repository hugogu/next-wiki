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
  | 'PAGE_PATH_RESERVED'
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

export function mapPublicDomainErrorCode(code: DomainError['code']): { code: PublicApiErrorCode; status: number } {
  switch (code) {
    case 'UNAUTHORIZED':
      return { code: 'UNAUTHORIZED', status: 401 };
    case 'FORBIDDEN':
      return { code: 'FORBIDDEN', status: 403 };
    case 'NOT_FOUND':
      return { code: 'NOT_FOUND', status: 404 };
    case 'CONFLICT':
      return { code: 'CONFLICT', status: 409 };
    case 'PAGE_PATH_CONFLICT':
      return { code: 'PAGE_PATH_CONFLICT', status: 409 };
    case 'PAGE_PATH_RESERVED':
      return { code: 'PAGE_PATH_RESERVED', status: 409 };
    case 'STALE_REVISION':
      return { code: 'STALE_REVISION', status: 409 };
    case 'REVISION_ALREADY_PUBLISHED':
      return { code: 'REVISION_ALREADY_PUBLISHED', status: 409 };
    case 'INVALID_IMAGE':
      return { code: 'UNSUPPORTED_ASSET_TYPE', status: 415 };
    case 'INPUT_TOO_LARGE':
    case 'ARCHIVE_TOO_LARGE':
      return { code: 'ASSET_TOO_LARGE', status: 413 };
    case 'RATE_LIMITED':
      return { code: 'RATE_LIMITED', status: 429 };
    case 'INDEX_NOT_READY':
      return { code: 'INDEX_NOT_READY', status: 409 };
    default:
      return { code: 'VALIDATION_FAILED', status: 422 };
  }
}

export function mapPublicDomainError(error: DomainError): NextResponse<PublicApiErrorBody> {
  const { code, status } = mapPublicDomainErrorCode(error.code);
  return publicApiError(code, error.message, status);
}
