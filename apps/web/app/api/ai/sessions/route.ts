import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiActionStatusSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listUserSessions } from '@/server/services/ai-actions';

/** @openapi @summary List my AI chat sessions @tag AI @auth bearer */
export async function GET(request: NextRequest) {
  const ctx = await createApiContext();
  const params = request.nextUrl.searchParams;
  const status = aiActionStatusSchema.safeParse(params.get('status'));
  const limit = z.coerce.number().int().min(1).max(100).safeParse(params.get('limit'));
  const offset = z.coerce.number().int().min(0).safeParse(params.get('offset'));
  try {
    return NextResponse.json(
      await listUserSessions(ctx, {
        search: params.get('search') ?? undefined,
        status: status.success ? status.data : undefined,
        limit: limit.success ? limit.data : undefined,
        offset: offset.success ? offset.data : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
