import { NextResponse, type NextRequest } from 'next/server';
import { feishuBindingConfirmInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { formatZodError, parseJson } from '@/server/api/validate';
import { DomainError } from '@/server/errors';
import { getActorUserId } from '@/server/permissions';
import { confirmBinding, unbindOwn } from '@/server/services/feishu-bindings';
import { getFeishuTransport } from '@/server/feishu/transport';
import { sendText } from '@/server/services/feishu-messaging';
import { feishuCopy } from '@/server/feishu/copy';
import { logger } from '@/server/logger';

// First-party binding confirmation route. Intentionally NOT part of the public
// REST/OpenAPI surface (no @openapi annotation).

/** Confirm a pending Feishu binding as the signed-in user. */
export async function POST(request: NextRequest) {
  const parsed = parseJson(
    feishuBindingConfirmInputSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);

  try {
    const ctx = await createApiContext();
    const userId = getActorUserId(ctx);
    if (!userId || ctx.actor.kind !== 'user') {
      throw new DomainError('UNAUTHORIZED', 'Sign in to confirm this binding');
    }
    const result = await confirmBinding({ token: parsed.data.token, userId });
    // Best-effort welcome DM; a send failure never fails the confirmation.
    try {
      const transport = await getFeishuTransport();
      if (transport) {
        await sendText(
          transport,
          { type: 'direct', openId: result.openId },
          feishuCopy.bindWelcome(result.displayName),
        );
      }
    } catch {
      logger.error('feishu welcome send failed', { bindingId: result.bindingId });
    }
    return NextResponse.json({ ok: true, displayName: result.displayName });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** The signed-in user unbinds their own Feishu identity. */
export async function DELETE() {
  try {
    const ctx = await createApiContext();
    const userId = getActorUserId(ctx);
    if (!userId || ctx.actor.kind !== 'user') {
      throw new DomainError('UNAUTHORIZED', 'Sign in to unbind');
    }
    const unbound = await unbindOwn(userId);
    return NextResponse.json({ ok: true, unbound });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
