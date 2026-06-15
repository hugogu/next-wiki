import { z } from 'zod';
import * as shared from '@next-wiki/shared';
import { publicProcedure, router } from '@/server/trpc/context';
import * as pageService from '@/server/services/pages';

export const pagesRouter = router({
  listPublished: publicProcedure
    .output(z.array(shared.pageSummarySchema))
    .query(({ ctx }) => pageService.listPublished(ctx)),

  getLive: publicProcedure
    .input(z.object({ slug: z.string() }))
    .output(shared.livePageSchema.nullable())
    .query(({ ctx, input }) => pageService.getLive(ctx, input.slug)),

  create: publicProcedure
    .input(shared.createPageInputSchema)
    .mutation(({ ctx, input }) => pageService.create(ctx, input)),

  newDraft: publicProcedure
    .input(shared.newDraftInputSchema)
    .mutation(({ ctx, input }) => pageService.newDraft(ctx, input)),

  getForEdit: publicProcedure
    .input(z.object({ slug: z.string() }))
    .output(shared.editableViewSchema.nullable())
    .query(({ ctx, input }) => pageService.getForEdit(ctx, input.slug)),

  getHistory: publicProcedure
    .input(z.object({ slug: z.string() }))
    .output(z.array(shared.revisionSummarySchema))
    .query(({ ctx, input }) => pageService.getHistory(ctx, input.slug)),

  getRevision: publicProcedure
    .input(z.object({ slug: z.string(), version: z.number().int().min(1) }))
    .output(shared.revisionViewSchema.nullable())
    .query(({ ctx, input }) => pageService.getRevision(ctx, input.slug, input.version)),
});

export type PagesRouter = typeof pagesRouter;
