import { initTRPC, TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import superjson from "superjson";
import { ZodError } from "zod";
import { getSession, buildPermissionContext } from "@/server/auth/session";
import type { PermissionContext } from "@/server/services/permissions/context";

export type TRPCContext = {
  userId: string | null;
  permissionContext: PermissionContext;
};

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await getSession();
  const userId = session?.user.id ?? null;
  const permissionContext = await buildPermissionContext(userId);
  return { userId, permissionContext };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Requires authenticated session.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// Requires admin group membership.
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.permissionContext.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

import { pagesRouter } from "./routers/pages";
import { searchRouter } from "./routers/search";

// Root router — explicit registration, no dynamic discovery (P9).
export const appRouter = createTRPCRouter({
  pages: pagesRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
