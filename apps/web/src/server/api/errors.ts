import { NextResponse } from 'next/server';
import { DomainError } from '@/server/errors';

export type ApiErrorCode = DomainError['code'];

export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
};

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export function mapDomainError(error: DomainError): NextResponse {
  const { code, message } = error;
  switch (code) {
    case 'BAD_REQUEST':
      return apiError(code, message, 400);
    case 'UNAUTHORIZED':
      return apiError(code, message, 401);
    case 'FORBIDDEN':
      return apiError(code, message, 403);
    case 'NOT_FOUND':
      return apiError(code, message, 404);
    case 'CONFLICT':
      return apiError(code, message, 409);
    case 'STALE_REVISION':
      return apiError(code, message, 409);
    case 'REVISION_ALREADY_PUBLISHED':
      return apiError(code, message, 409);
    case 'INVALID_IMAGE':
      return apiError(code, message, 400);
    case 'STORAGE_MIGRATING':
      return apiError(code, message, 423);
    case 'STORAGE_UNAVAILABLE':
      return apiError(code, message, 503);
    case 'AI_DISABLED':
    case 'AI_NOT_CONFIGURED':
    case 'PROVIDER_DISABLED':
    case 'MODEL_UNAVAILABLE':
    case 'INDEX_NOT_READY':
      return apiError(code, message, 409);
    case 'AI_FEATURE_DISABLED':
      return apiError(code, message, 403);
    case 'PROVIDER_IN_USE':
    case 'MODEL_IN_USE':
    case 'CAPABILITY_MISMATCH':
      return apiError(code, message, 409);
    case 'MODEL_NOT_FOUND':
      return apiError(code, message, 404);
    case 'CAPABILITY_UNSUPPORTED':
    case 'EMBEDDING_DIMENSIONS_REQUIRED':
    case 'FULL_CONTEXT_TOO_LARGE':
    case 'INSUFFICIENT_WIKI_EVIDENCE':
    case 'INPUT_TOO_LARGE':
    case 'CONTENT_REJECTED':
    case 'INVALID_RESPONSE':
      return apiError(code, message, 422);
    case 'RATE_LIMITED':
      return apiError(code, message, 429);
    case 'PROVIDER_AUTH_FAILED':
      return apiError(code, message, 422);
    case 'TIMEOUT':
      return apiError(code, message, 504);
    case 'PROVIDER_UNAVAILABLE':
      return apiError(code, message, 503);
    case 'CANCELLED':
    case 'TRANSFER_CONFLICT':
    case 'TRANSFER_ALREADY_RUNNING':
    case 'SOURCE_IN_USE':
    case 'ARTIFACT_IN_USE':
    case 'ARTIFACT_NOT_UPLOADABLE':
    case 'RUN_NOT_ACTIVE':
    case 'RUN_NOT_PAUSED':
    case 'RUN_NOT_PAUSABLE':
    case 'RUN_NOT_CLEANABLE':
      return apiError(code, message, 409);
    case 'TRANSFER_NOT_FOUND':
      return apiError(code, message, 404);
    case 'INVALID_TRANSFER_OPTIONS':
    case 'INVALID_ARCHIVE':
      return apiError(code, message, 400);
    case 'ARCHIVE_TOO_LARGE':
      return apiError(code, message, 413);
    case 'INVALID_ARCHIVE_TYPE':
      return apiError(code, message, 415);
    case 'UNSUPPORTED_ARCHIVE_VERSION':
    case 'UNSUPPORTED_SOURCE_CONTENT':
    case 'SOURCE_INVALID_RESPONSE':
      return apiError(code, message, 422);
    case 'SOURCE_UNAVAILABLE':
      return apiError(code, message, 502);
    case 'SOURCE_TIMEOUT':
      return apiError(code, message, 504);
    case 'INVALID_TRANSLATION_INPUT':
      return apiError(code, message, 400);
    case 'TRANSLATION_NOT_FOUND':
      return apiError(code, message, 404);
    case 'TRANSLATION_ALREADY_RUNNING':
      return apiError(code, message, 409);
    case 'SOURCE_NOT_TRANSLATABLE':
      return apiError(code, message, 422);
    case 'JOB_QUEUE_UNAVAILABLE':
      return apiError(code, message, 503);
    default:
      return apiError('BAD_REQUEST', message, 400);
  }
}

export function internalError(message = 'Internal server error') {
  return NextResponse.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
}
