import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/trpc/root";
import { buildPermissionContext } from "@/server/auth/session";

const pagePathSchema = z.object({
  spaceKey: z.string().min(1),
  path: z.string().startsWith("/"),
  locale: z.string().default("en"),
});

const createPageSchema = z.object({
  spaceKey: z.string().min(1),
  path: z.string().startsWith("/"),
  locale: z.string().default("en"),
  title: z.string().min(1).max(500),
  summary: z.string().max(1000).optional(),
  sourceContent: z.string(),
  sourceFormat: z.string().default("markdown"),
  changeSummary: z.string().max(500).optional(),
  tagSlugs: z.array(z.string()).default([]),
  translationGroupId: z.string().uuid().optional(),
});

const updatePageSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(1000).optional(),
  sourceContent: z.string().optional(),
  sourceFormat: z.string().optional(),
  changeSummary: z.string().max(500).optional(),
  tagSlugs: z.array(z.string()).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const pagesRouter = createTRPCRouter({
  get: publicProcedure.input(pagePathSchema).query(async ({ input, ctx }) => {
    const { getPage } = await import("@/server/services/wiki/page-service");
    return getPage(input.spaceKey, input.path, input.locale, ctx.permissionContext);
  }),

  getById: publicProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { getPageById } = await import("@/server/services/wiki/page-service");
      return getPageById(input.pageId, ctx.permissionContext);
    }),

  create: protectedProcedure.input(createPageSchema).mutation(async ({ input, ctx }) => {
    const { createPage } = await import("@/server/services/wiki/page-service");
    return createPage(input, ctx.permissionContext);
  }),

  update: protectedProcedure.input(updatePageSchema).mutation(async ({ input, ctx }) => {
    const { updatePage } = await import("@/server/services/wiki/page-service");
    const { pageId, ...rest } = input;
    return updatePage(pageId, rest, ctx.permissionContext);
  }),

  delete: protectedProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { deletePage } = await import("@/server/services/wiki/page-service");
      return deletePage(input.pageId, ctx.permissionContext);
    }),

  restore: protectedProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { restorePage } = await import("@/server/services/wiki/page-service");
      return restorePage(input.pageId, ctx.permissionContext);
    }),

  move: protectedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        targetPath: z.string().startsWith("/"),
        targetSpaceKey: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { movePage } = await import("@/server/services/wiki/page-service");
      return movePage(input.pageId, input.targetPath, input.targetSpaceKey, ctx.permissionContext);
    }),

  listRevisions: publicProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { listPageRevisions } = await import("@/server/services/wiki/page-service");
      return listPageRevisions(input.pageId, ctx.permissionContext);
    }),

  getRevision: publicProcedure
    .input(z.object({ revisionId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { getRevision } = await import("@/server/services/wiki/page-service");
      return getRevision(input.revisionId, ctx.permissionContext);
    }),

  restoreRevision: protectedProcedure
    .input(z.object({ pageId: z.string().uuid(), revisionId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { restoreRevision } = await import("@/server/services/wiki/page-service");
      return restoreRevision(input.pageId, input.revisionId, ctx.permissionContext);
    }),

  diffRevisions: publicProcedure
    .input(z.object({ revisionIdA: z.string().uuid(), revisionIdB: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { diffRevisions } = await import("@/server/services/wiki/revision-diff-service");
      return diffRevisions(input.revisionIdA, input.revisionIdB, ctx.permissionContext);
    }),

  render: publicProcedure.input(pagePathSchema).query(async ({ input, ctx }) => {
    const { getPage } = await import("@/server/services/wiki/page-service");
    const { getRevision } = await import("@/server/services/wiki/page-service");
    const { renderPage } = await import("@/server/pipeline/index");

    const page = await getPage(input.spaceKey, input.path, input.locale, ctx.permissionContext);
    if (!page.currentRevisionId) return { html: "", metadata: null };

    const revision = await getRevision(page.currentRevisionId, ctx.permissionContext);
    return renderPage(revision.sourceContent, {
      pageId: page.id,
      revisionId: revision.id,
      spaceKey: input.spaceKey,
      locale: input.locale,
      contentHash: revision.contentHash,
    });
  }),
});
