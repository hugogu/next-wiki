import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getUsageStats } from '@/server/services/ai-actions';

/** @openapi @summary AI usage statistics @tag AI Admin @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await getUsageStats(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
