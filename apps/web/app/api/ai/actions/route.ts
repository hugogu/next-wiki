import { NextResponse, type NextRequest } from 'next/server';
import { aiActionFeatureSchema, aiActionStatusSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listActions } from '@/server/services/ai-actions';

/** @openapi @summary List AI action audit @tag AI @auth bearer */
export async function GET(request: NextRequest) {
  const ctx = await createApiContext();
  const feature = aiActionFeatureSchema.safeParse(request.nextUrl.searchParams.get('feature'));
  const status = aiActionStatusSchema.safeParse(request.nextUrl.searchParams.get('status'));
  try {
    return NextResponse.json({
      items: await listActions(ctx, {
        feature: feature.success ? feature.data : undefined,
        status: status.success ? status.data : undefined,
      }),
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
