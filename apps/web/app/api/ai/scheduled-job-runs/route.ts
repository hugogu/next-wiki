import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { scheduledAiJobRunListFilterSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listAllScheduledAiJobRuns } from '@/server/services/scheduled-ai-jobs';

/** @openapi @summary List all scheduled AI job runs @tag AI Admin @auth bearer */
export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = scheduledAiJobRunListFilterSchema.safeParse(query); const jobId = z.string().uuid().optional().safeParse(query.jobId);
  if (!parsed.success || !jobId.success) return apiError('BAD_REQUEST', 'Invalid run filters', 400);
  try { return NextResponse.json(await listAllScheduledAiJobRuns(await createApiContext(), { ...parsed.data, jobId: jobId.data }), { headers: { 'cache-control': 'no-store' } }); }
  catch (error) { return error instanceof DomainError ? mapDomainError(error) : internalError(); }
}
