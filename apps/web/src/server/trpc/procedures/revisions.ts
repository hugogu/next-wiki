import { revisionInputSchema } from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as revisionService from '@/server/services/revisions';

export const revisionsRouter = router({
  publish: publicProcedure
    .input(revisionInputSchema)
    .mutation(({ ctx, input }) => revisionService.publish(ctx, input)),
});

export type RevisionsRouter = typeof revisionsRouter;
