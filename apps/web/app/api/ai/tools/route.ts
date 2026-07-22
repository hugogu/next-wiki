import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { listToolsWithEffectivePolicy } from '@/server/services/ai-tool-policy';

/** @openapi @summary List AI tool providers and effective policies @tag AI Tools @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await listToolsWithEffectivePolicy(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
