import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { cancelScheduledAiJobRun } from '@/server/services/scheduled-ai-jobs';

type Params = { params: Promise<{ id: string; runId: string }> }; const idSchema = z.string().uuid(); const noStore = { 'cache-control': 'no-store' };
/** @openapi @summary Cancel scheduled AI job run @tag AI Admin @auth bearer */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id, runId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(runId).success) return apiError('NOT_FOUND', 'Not found', 404);
  try { return NextResponse.json(await cancelScheduledAiJobRun(await createApiContext(), id, runId), { headers: noStore }); }
  catch (error) { return error instanceof DomainError ? mapDomainError(error) : internalError(); }
}
