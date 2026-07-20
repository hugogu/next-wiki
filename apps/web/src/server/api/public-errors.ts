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
  | 'SPACE_UNAVAILABLE'
  | 'SPACE_FORBIDDEN'
  | 'RAW_SPACE_IMMUTABLE'
  | 'OKF_TYPE_REQUIRED'
  | 'OKF_RESERVED_PATH'
  | 'LINK_TARGET_INVALID'
  | 'MODE_SWITCH_INVALID'
  | 'MODE_SWITCH_IN_PROGRESS'
  | 'RAW_CONTENT_TYPE_INVALID'
  | 'RAW_CONTENT_TYPE_MISMATCH'
  | 'RAW_CATEGORY_REQUIRED'
  | 'RAW_CATEGORY_RETIRED'
  | 'RAW_CATEGORY_HAS_ENTRIES'
  | 'PAGE_SPACE_MOVE_INVALID'
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
    case 'SPACE_UNAVAILABLE':
      return { code: 'SPACE_UNAVAILABLE', status: 403 };
    case 'SPACE_FORBIDDEN':
      return { code: 'SPACE_FORBIDDEN', status: 403 };
    case 'RAW_SPACE_IMMUTABLE':
      return { code: 'RAW_SPACE_IMMUTABLE', status: 403 };
    case 'MODE_SWITCH_IN_PROGRESS':
      return { code: 'MODE_SWITCH_IN_PROGRESS', status: 409 };
    case 'MODE_SWITCH_INVALID':
      return { code: 'MODE_SWITCH_INVALID', status: 422 };
    case 'OKF_TYPE_REQUIRED':
      return { code: 'OKF_TYPE_REQUIRED', status: 422 };
    case 'OKF_RESERVED_PATH':
      return { code: 'OKF_RESERVED_PATH', status: 422 };
    case 'LINK_TARGET_INVALID':
      return { code: 'LINK_TARGET_INVALID', status: 422 };
    case 'RAW_CONTENT_TYPE_INVALID':
      return { code: 'RAW_CONTENT_TYPE_INVALID', status: 422 };
    case 'RAW_CONTENT_TYPE_MISMATCH':
      return { code: 'RAW_CONTENT_TYPE_MISMATCH', status: 422 };
    case 'RAW_CATEGORY_REQUIRED':
      return { code: 'RAW_CATEGORY_REQUIRED', status: 422 };
    case 'RAW_CATEGORY_RETIRED':
      return { code: 'RAW_CATEGORY_RETIRED', status: 422 };
    case 'RAW_CATEGORY_HAS_ENTRIES':
      return { code: 'RAW_CATEGORY_HAS_ENTRIES', status: 409 };
    case 'PAGE_SPACE_MOVE_INVALID':
      return { code: 'PAGE_SPACE_MOVE_INVALID', status: 422 };
    default:
      return { code: 'VALIDATION_FAILED', status: 422 };
  }
}

export function mapPublicDomainError(error: DomainError): NextResponse<PublicApiErrorBody> {
  const { code, status } = mapPublicDomainErrorCode(error.code);
  return publicApiError(code, error.message, status);
}
