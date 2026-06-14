import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { getCurrentActor } from '@/server/services/auth';
import type { PermCtx } from '@/server/permissions';

export async function createTRPCContext(): Promise<PermCtx> {
  const actor = await getCurrentActor();
  return { actor };
}

const t = initTRPC.context<PermCtx>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
