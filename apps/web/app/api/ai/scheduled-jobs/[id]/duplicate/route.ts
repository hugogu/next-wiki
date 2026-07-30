import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { duplicateScheduledAiJob } from '@/server/services/scheduled-ai-jobs';

type Params = { params: Promise<{ id: string }> }; const idSchema = z.string().uuid();
/** @openapi @summary Duplicate a scheduled AI job as paused @tag AI Admin @auth bearer */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params; if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try { return NextResponse.json(await duplicateScheduledAiJob(await createApiContext(), id), { status: 201, headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return error instanceof DomainError ? mapDomainError(error) : internalError(); }
}
