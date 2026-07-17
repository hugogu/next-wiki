import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as setupService from '@/server/services/setup';
import { reconcileSetupAi } from '@/server/services/setup-ai';

export const dynamic = 'force-dynamic';

/**
 * First-run onboarding state.
 *
 * @openapi
 * @summary Get setup state
 * @description Returns the current first-run onboarding state. Anonymous callers only receive whether account setup is needed; the signed-in Admin receives the full resumable state. Never cached and never contains credentials.
 * @tag Setup
 * @response SetupStateView
 */
export async function GET() {
  try {
    const ctx = await createApiContext();
    // Advance any in-flight AI bootstrap before shaping the state so polling
    // clients observe terminal outcomes without a dedicated worker callback.
    await reconcileSetupAi(ctx.actor).catch(() => undefined);
    return NextResponse.json(await setupService.getSetupState(ctx.actor));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
