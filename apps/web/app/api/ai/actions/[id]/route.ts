import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import * as actions from '@/server/services/ai-actions';
import { getAnonymousAiAccessToken } from '@/server/services/auth';

const idSchema = z.string().uuid();

/** @openapi @summary Get AI action @tag AI @auth bearer @response AiActionView */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await actions.getAction(ctx, id, await getAnonymousAiAccessToken()));
  } catch (error) {
    return handleApiError(error);
  }
}

/** @openapi @summary Cancel AI action @tag AI @auth bearer @response 202:AiActionView */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await actions.requestActionCancellation(ctx, id, await getAnonymousAiAccessToken()), { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
