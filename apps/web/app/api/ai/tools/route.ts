import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { handleApiError } from '@/server/api/errors';
import { listToolsWithEffectivePolicy } from '@/server/services/ai-tool-policy';

/** @openapi @summary List AI tool providers and effective policies @description Available to authenticated users; policy changes remain administrator-only. @tag AI Tools @auth bearer */
export async function GET() {
  try {
    return NextResponse.json(await listToolsWithEffectivePolicy(await createApiContext()));
  } catch (error) {
    return handleApiError(error);
  }
}
