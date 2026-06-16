import { router } from '@/server/trpc/context';
import { pagesRouter } from '@/server/trpc/procedures/pages';
import { authRouter } from '@/server/trpc/procedures/auth';
import { revisionsRouter } from '@/server/trpc/procedures/revisions';
import { usersRouter } from '@/server/trpc/procedures/users';

export const appRouter = router({
  pages: pagesRouter,
  auth: authRouter,
  revisions: revisionsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
