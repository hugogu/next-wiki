import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { updateSpaceConfiguration } from '@/server/services/spaces';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ spaceId: z.string().uuid() });
const inputSchema = z.object({
  routePrefix: z.string().min(1).max(63),
  defaultVisibility: z.enum(['public', 'registered', 'restricted']),
});

export async function PUT(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError('BAD_REQUEST', 'Invalid space id', 400);
  const parsedInput = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedInput.success) return apiError('BAD_REQUEST', 'Invalid space configuration', 400);
  try {
    const space = await updateSpaceConfiguration(await createApiContext(), parsedParams.data.spaceId, parsedInput.data);
    return NextResponse.json(space);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
