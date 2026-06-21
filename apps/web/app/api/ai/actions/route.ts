import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aiActionFeatureSchema, aiActionStatusSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listActions } from '@/server/services/ai-actions';

/** @openapi @summary List AI action audit @tag AI @auth bearer */
export async function GET(request: NextRequest) {
  const ctx = await createApiContext();
  const params = request.nextUrl.searchParams;
  const feature = aiActionFeatureSchema.safeParse(params.get('feature'));
  const status = aiActionStatusSchema.safeParse(params.get('status'));
  const providerId = z.string().uuid().safeParse(params.get('providerId'));
  const modelId = z.string().uuid().safeParse(params.get('modelId'));
  const limit = z.coerce.number().int().min(1).max(200).safeParse(params.get('limit'));
  const offset = z.coerce.number().int().min(0).safeParse(params.get('offset'));
  try {
    return NextResponse.json(
      await listActions(ctx, {
        feature: feature.success ? feature.data : undefined,
        status: status.success ? status.data : undefined,
        providerId: providerId.success ? providerId.data : undefined,
        modelId: modelId.success ? modelId.data : undefined,
        limit: limit.success ? limit.data : undefined,
        offset: offset.success ? offset.data : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
