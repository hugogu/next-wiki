import { NextResponse } from 'next/server';
import { registerInputSchema } from '@next-wiki/shared';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as authService from '@/server/services/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(registerInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const { userId } = await authService.register(parsed.data);
    await authService.establishSession(userId);
    return NextResponse.json({ userId }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
