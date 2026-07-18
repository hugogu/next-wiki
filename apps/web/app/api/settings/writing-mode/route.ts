import { NextResponse } from 'next/server';
import { z } from 'zod';
import { writingModeSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { getSwitchState, switchMode } from '@/server/services/writing-mode';

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

const switchInputSchema = z.object({
  mode: writingModeSchema,
  rawVisibility: z.enum(['public', 'restricted']).optional(),
  generatedVisibility: z.enum(['public', 'restricted']).optional(),
});

/**
 * @openapi
 * @summary Change the writing mode
 * @description Switches to LLM Wiki immediately, or queues the transactional LLM Wiki to Copilot migration. Requires an Admin session.
 * @tag Settings
 * @auth bearer
 * @body WritingModeSwitchInput
 * @response 200:WritingModeSettingsView
 * @response 202:WritingModeSwitchAccepted
 */
export async function PUT(request: Request) {
  const parsed = parseJson(switchInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const ctx = await createApiContext();
    const result = await switchMode(ctx, parsed.data.mode, {
      rawVisibility: parsed.data.rawVisibility!,
      generatedVisibility: parsed.data.generatedVisibility!,
    });
    if (result.status === 'pending') return NextResponse.json({ jobId: result.jobId }, { status: 202 });
    return NextResponse.json({ mode: result.mode });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
