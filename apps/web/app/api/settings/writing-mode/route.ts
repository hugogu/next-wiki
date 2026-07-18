import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getSwitchState } from '@/server/services/writing-mode';

export const dynamic = 'force-dynamic';

/**
 * @openapi
 * @summary Get the writing mode settings
 * @description Returns the instance writing mode and any in-progress mode switch. Requires an Admin session.
 * @tag Settings
 * @auth bearer
 * @response WritingModeSettingsView
 */
export async function GET() {
  try {
    const ctx = await createApiContext();
    if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
      throw new DomainError('FORBIDDEN', 'You do not have permission to view writing mode settings');
    }
    return NextResponse.json(await getSwitchState());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
