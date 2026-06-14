import { z } from 'zod';
import * as shared from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as pageService from '@/server/services/pages';

export const pagesRouter = router({
  listPublished: publicProcedure.query(async ({ ctx }) => {
    const rows = await pageService.listPublished(ctx);
    return rows.map((r) => shared.pageSummarySchema.parse(r));
  }),

  getLive: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await pageService.getLive(ctx, input.slug);
      return row ? shared.livePageSchema.parse(row) : null;
    }),
});

export type PagesRouter = typeof pagesRouter;
