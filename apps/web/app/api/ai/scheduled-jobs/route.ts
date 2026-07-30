import { NextResponse, type NextRequest } from 'next/server';
import { scheduledAiJobCreateSchema, scheduledAiJobListFilterSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { createScheduledAiJob, listScheduledAiJobs } from '@/server/services/scheduled-ai-jobs';

const noStore = { 'cache-control': 'no-store' };
function query(request: NextRequest) {
  return Object.fromEntries(request.nextUrl.searchParams.entries());
}

/** @openapi @summary List scheduled AI jobs @tag AI Admin @auth bearer */
export async function GET(request: NextRequest) {
  const parsed = scheduledAiJobListFilterSchema.safeParse(query(request));
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await listScheduledAiJobs(await createApiContext(), parsed.data), {
      headers: noStore,
    });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}

/** @openapi @summary Create a scheduled AI job @tag AI Admin @auth bearer */
export async function POST(request: NextRequest) {
  const parsed = parseJson(scheduledAiJobCreateSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await createScheduledAiJob(await createApiContext(), parsed.data), {
      status: 201,
      headers: noStore,
    });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
