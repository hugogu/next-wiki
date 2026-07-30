import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { scheduledAiJobRunListFilterSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listScheduledAiJobRuns, runScheduledAiJobNow } from '@/server/services/scheduled-ai-jobs';

type Params = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();
const noStore = { 'cache-control': 'no-store' };
/** @openapi @summary List scheduled AI job runs @tag AI Admin @auth bearer */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  const parsed = scheduledAiJobRunListFilterSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return apiError('BAD_REQUEST', 'Invalid run filters', 400);
  try {
    return NextResponse.json(
      await listScheduledAiJobRuns(await createApiContext(), id, parsed.data),
      { headers: noStore },
    );
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
/** @openapi @summary Run a scheduled AI job now @tag AI Admin @auth bearer */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await runScheduledAiJobNow(await createApiContext(), id), {
      status: 202,
      headers: noStore,
    });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
