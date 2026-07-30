import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { scheduledAiJobUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import {
  getScheduledAiJob,
  retireScheduledAiJob,
  updateScheduledAiJob,
} from '@/server/services/scheduled-ai-jobs';

type Params = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();
const noStore = { 'cache-control': 'no-store' };

/** @openapi @summary Get a scheduled AI job @tag AI Admin @auth bearer */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await getScheduledAiJob(await createApiContext(), id), {
      headers: noStore,
    });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}

/** @openapi @summary Update a scheduled AI job @tag AI Admin @auth bearer */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const parsed = parseJson(scheduledAiJobUpdateSchema, await request.json().catch(() => ({})));
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(
      await updateScheduledAiJob(await createApiContext(), id, parsed.data),
      { headers: noStore },
    );
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}

/** @openapi @summary Retire a scheduled AI job @tag AI Admin @auth bearer */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await retireScheduledAiJob(await createApiContext(), id), {
      headers: noStore,
    });
  } catch (error) {
    return error instanceof DomainError ? mapDomainError(error) : internalError();
  }
}
