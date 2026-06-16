import { z } from 'zod';
import {
  setRoleInputSchema,
  setStatusInputSchema,
  resetPasswordInputSchema,
  userViewSchema,
} from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as userService from '@/server/services/users';

export const usersRouter = router({
  list: publicProcedure
    .output(z.array(userViewSchema))
    .query(({ ctx }) => userService.list(ctx)),

  setRole: publicProcedure
    .input(setRoleInputSchema)
    .mutation(({ ctx, input }) => userService.setRole(ctx, input.userId, input.role)),

  setStatus: publicProcedure
    .input(setStatusInputSchema)
    .mutation(({ ctx, input }) => userService.setStatus(ctx, input.userId, input.status)),

  resetPassword: publicProcedure
    .input(resetPasswordInputSchema)
    .mutation(({ ctx, input }) => userService.resetPassword(ctx, input.userId, input.tempPassword)),
});

export type UsersRouter = typeof usersRouter;
