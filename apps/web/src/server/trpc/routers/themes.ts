import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/server/trpc/root";
import {
  listThemes,
  getTheme,
  createTheme,
  updateTheme,
  activateTheme,
  deleteTheme,
} from "@/server/services/themes/theme-service";

const themeKeySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Key must be lowercase alphanumeric with hyphens");

export const themesRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) => listThemes(ctx.permissionContext)),

  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) => getTheme(input.id, ctx.permissionContext)),

  create: adminProcedure
    .input(
      z.object({
        key: themeKeySchema,
        name: z.string().min(1),
        tokenSet: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) => createTheme(input, ctx.permissionContext)),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        tokenSet: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      updateTheme(input.id, { name: input.name, tokenSet: input.tokenSet }, ctx.permissionContext),
    ),

  activate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input, ctx }) => activateTheme(input.id, ctx.permissionContext)),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input, ctx }) => deleteTheme(input.id, ctx.permissionContext)),
});
