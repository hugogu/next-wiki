import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getScheduledAiJobRun } from '@/server/services/scheduled-ai-jobs';

type Params = { params: Promise<{ id: string; runId: string }> }; const idSchema = z.string().uuid();
/** @openapi @summary Get scheduled AI job run detail @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, runId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(runId).success) return apiError('NOT_FOUND', 'Not found', 404);
  try { return NextResponse.json(await getScheduledAiJobRun(await createApiContext(), id, runId), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return error instanceof DomainError ? mapDomainError(error) : internalError(); }
}
