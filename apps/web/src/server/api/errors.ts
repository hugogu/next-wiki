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
    default:
      return apiError('BAD_REQUEST', message, 400);
  }
}

export function internalError(message = 'Internal server error') {
  return NextResponse.json({ code: 'INTERNAL_ERROR', message }, { status: 500 });
}
