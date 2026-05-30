import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/trpc/root";

export const aiRouter = createTRPCRouter({
  // Provider management (admin only)
  listProviders: adminProcedure.query(async ({ ctx }) => {
    const { listProviders } = await import("@/server/services/ai/provider-service");
    return listProviders(ctx.permissionContext);
  }),

  createProvider: adminProcedure
    .input(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        providerType: z.enum(["openai", "anthropic", "ollama", "custom"]),
        endpoint: z.string().optional(),
        credentials: z.record(z.string()).optional(),
        defaultModel: z.string().optional(),
        embeddingModel: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { createProvider } = await import("@/server/services/ai/provider-service");
      return createProvider(input, ctx.permissionContext);
    }),

  updateProvider: adminProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        endpoint: z.string().optional(),
        credentials: z.record(z.string()).optional(),
        defaultModel: z.string().optional(),
        embeddingModel: z.string().optional(),
        capabilities: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { updateProvider } = await import("@/server/services/ai/provider-service");
      const { id, ...rest } = input;
      return updateProvider(id, rest, ctx.permissionContext);
    }),

  deleteProvider: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { deleteProvider } = await import("@/server/services/ai/provider-service");
      await deleteProvider(input.id, ctx.permissionContext);
    }),

  checkProviderHealth: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { checkProviderHealth } = await import("@/server/services/ai/provider-service");
      return checkProviderHealth(input.id, ctx.permissionContext);
    }),

  // Conversation management (authenticated users)
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const { listConversations } = await import("@/server/services/ai/conversation-service");
    return listConversations(ctx.permissionContext);
  }),

  createConversation: protectedProcedure
    .input(
      z.object({
        contextType: z.enum(["global", "space", "page"]).optional(),
        contextId: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { createConversation } = await import(
        "@/server/services/ai/conversation-service"
      );
      return createConversation(input, ctx.permissionContext);
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { deleteConversation } = await import(
        "@/server/services/ai/conversation-service"
      );
      await deleteConversation(input.id, ctx.permissionContext);
    }),

  listMessages: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { listMessages } = await import("@/server/services/ai/message-service");
      return listMessages(input.conversationId, ctx.permissionContext);
    }),

  // Admin: view all conversations
  listAllConversations: adminProcedure.query(async ({ ctx }) => {
    const { listConversations } = await import("@/server/services/ai/conversation-service");
    return listConversations(ctx.permissionContext, { includeAll: true });
  }),
});
