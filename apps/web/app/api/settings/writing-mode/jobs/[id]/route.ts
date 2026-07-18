import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getWritingModeSwitchJob } from '@/server/services/writing-mode';

const idSchema = z.string().uuid();

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Writing-mode switch not found', 404);
  try {
    const view = await getWritingModeSwitchJob(await createApiContext(), id);
    if (!view) return apiError('NOT_FOUND', 'Writing-mode switch not found', 404);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
