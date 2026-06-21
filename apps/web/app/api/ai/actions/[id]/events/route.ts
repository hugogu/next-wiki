import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createActionEventStream } from '@/server/ai/events/action-events';

const idSchema = z.string().uuid();

/** @openapi @summary Stream AI action events @tag AI @auth bearer */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  const cursor = Number(request.headers.get('last-event-id') ?? request.nextUrl.searchParams.get('after') ?? 0);
  try {
    const stream = await createActionEventStream(ctx, id, Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0);
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
