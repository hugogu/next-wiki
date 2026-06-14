import { router } from '@/server/trpc/context';
import { pagesRouter } from '@/server/trpc/procedures/pages';
import { authRouter } from '@/server/trpc/procedures/auth';

export const appRouter = router({
  pages: pagesRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
