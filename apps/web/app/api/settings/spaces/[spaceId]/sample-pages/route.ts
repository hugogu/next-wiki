import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { reinitializeSamplePages } from '@/server/services/setup-sample-pages';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ spaceId: z.string().uuid() });

/** Re-run managed example-page initialization for the built-in Wiki space. */
export async function POST(_request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError('BAD_REQUEST', 'Invalid space id', 400);
  try {
    const result = await reinitializeSamplePages((await createApiContext()).actor, parsedParams.data.spaceId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
