import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc/root";

export const searchRouter = createTRPCRouter({
  query: publicProcedure
    .input(
      z.object({
        q: z.string().min(1).max(500),
        spaceKey: z.string().optional(),
        locale: z.string().optional(),
        tagSlugs: z.array(z.string()).default([]),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { searchPages } = await import("@/server/services/search/query-service");
      return searchPages({ ...input, actor: ctx.permissionContext });
    }),

  byTag: publicProcedure
    .input(
      z.object({
        tagSlug: z.string(),
        spaceKey: z.string().optional(),
        locale: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { getPagesByTag } = await import("@/server/services/search/query-service");
      return getPagesByTag(input.tagSlug, { ...input, actor: ctx.permissionContext });
    }),

  tags: publicProcedure
    .input(z.object({ q: z.string().optional(), limit: z.number().int().max(50).default(20) }))
    .query(async ({ input }) => {
      const { listTags } = await import("@/server/services/wiki/tag-service");
      return listTags(input);
    }),

  backlinks: publicProcedure
    .input(z.object({ spaceKey: z.string(), path: z.string().startsWith("/") }))
    .query(async ({ input }) => {
      const { getBacklinks } = await import("@/server/services/wiki/link-service");
      return getBacklinks(input.spaceKey, input.path);
    }),
});
