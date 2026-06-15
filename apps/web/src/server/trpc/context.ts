import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { getCurrentActor } from '@/server/services/auth';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';

export async function createTRPCContext(): Promise<PermCtx> {
  const actor = await getCurrentActor();
  return { actor };
}

const t = initTRPC.context<PermCtx>().create({ transformer: superjson });

/**
 * Translates a service-layer DomainError into a typed TRPCError so clients get
 * a stable `error.data.code` and a safe message instead of an opaque 500.
 */
const domainErrorMiddleware = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) {
    const { code, message } = result.error.cause;
    throw new TRPCError({ code, message });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(domainErrorMiddleware);
