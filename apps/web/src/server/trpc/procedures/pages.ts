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

  create: publicProcedure
    .input(shared.createPageInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await pageService.create(ctx, input);
      return result;
    }),

  newDraft: publicProcedure
    .input(shared.newDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await pageService.newDraft(ctx, input);
      return result;
    }),

  getForEdit: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await pageService.getForEdit(ctx, input.slug);
      return row ? shared.editableViewSchema.parse(row) : null;
    }),

  getHistory: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await pageService.getHistory(ctx, input.slug);
      return rows.map((r) => shared.revisionSummarySchema.parse(r));
    }),

  getRevision: publicProcedure
    .input(z.object({ slug: z.string(), version: z.number().int().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await pageService.getRevision(ctx, input.slug, input.version);
      return row ? shared.revisionViewSchema.parse(row) : null;
    }),
});

export type PagesRouter = typeof pagesRouter;
