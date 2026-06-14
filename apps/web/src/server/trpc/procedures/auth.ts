import { eq } from 'drizzle-orm';
import { registerInputSchema, loginInputSchema, meOutputSchema } from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as authService from '@/server/services/auth';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

export const authRouter = router({
  register: publicProcedure
    .input(registerInputSchema)
    .mutation(async ({ input }) => {
      const { userId } = await authService.register(input);
      await authService.establishSession(userId);
      return { userId };
    }),

  login: publicProcedure
    .input(loginInputSchema)
    .mutation(async ({ input }) => {
      const { userId } = await authService.login(input);
      await authService.establishSession(userId);
      return { userId };
    }),

  logout: publicProcedure.mutation(async () => {
    await authService.logout();
    return { ok: true };
  }),

  me: publicProcedure.query(async () => {
    const actor = await authService.getCurrentActor();
    if (actor.kind === 'anonymous') return null;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, actor.userId),
    });

    if (!user) return null;

    return meOutputSchema.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
    });
  }),
});

export type AuthRouter = typeof authRouter;
