import { NextResponse } from 'next/server';
import { loginInputSchema, loginOutputSchema } from '@next-wiki/shared';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as authService from '@/server/services/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(loginInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await authService.login(parsed.data);
    await authService.establishSession(result.userId);
    const output = loginOutputSchema.parse(result);
    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
