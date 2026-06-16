import { eq } from 'drizzle-orm';
import {
  registerInputSchema,
  loginInputSchema,
  loginOutputSchema,
  meOutputSchema,
  setMyPasswordInputSchema,
  setupInputSchema,
} from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as authService from '@/server/services/auth';
import * as setupService from '@/server/services/setup';
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
    .output(loginOutputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.login(input);
      await authService.establishSession(result.userId);
      return result;
    }),

  logout: publicProcedure.mutation(async () => {
    await authService.logout();
    return { ok: true };
  }),

  me: publicProcedure.output(meOutputSchema.nullable()).query(async () => {
    const actor = await authService.getCurrentActor();
    if (actor.kind === 'anonymous') return null;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, actor.userId),
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName ?? null,
    };
  }),

  setMyPassword: publicProcedure
    .input(setMyPasswordInputSchema)
    .mutation(({ ctx, input }) => authService.setMyPassword(ctx, input.newPassword)),

  setup: publicProcedure
    .input(setupInputSchema)
    .mutation(({ input }) => setupService.setupAdmin(input)),
});

export type AuthRouter = typeof authRouter;
