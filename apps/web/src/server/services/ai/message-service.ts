import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiCitations, aiConversationMessages, aiConversations } from "@/server/db/schema/ai";
import { pageRevisions, pages } from "@/server/db/schema/wiki";
import { ForbiddenError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";
import { getConversation } from "./conversation-service";

export type MessageRow = typeof aiConversationMessages.$inferSelect;

export type MessageWithCitations = MessageRow & {
  citations: Array<{
    id: string;
    pageRevisionId: string;
    excerptLocator: string | null;
    orderIndex: number;
    pageId?: string;
    pageSlug?: string;
    pageTitle?: string;
  }>;
};

export async function listMessages(
  conversationId: string,
  actor: PermissionContext,
): Promise<MessageWithCitations[]> {
  await getConversation(conversationId, actor);
  const db = getDb();

  const rows = await db
    .select({
      message: aiConversationMessages,
      citation: {
        id: aiCitations.id,
        pageRevisionId: aiCitations.pageRevisionId,
        excerptLocator: aiCitations.excerptLocator,
        orderIndex: aiCitations.orderIndex,
      },
      page: {
        id: pages.id,
        path: pages.path,
        title: pages.title,
      },
    })
    .from(aiConversationMessages)
    .leftJoin(aiCitations, eq(aiCitations.messageId, aiConversationMessages.id))
    .leftJoin(pageRevisions, eq(pageRevisions.id, aiCitations.pageRevisionId))
    .leftJoin(pages, eq(pages.id, pageRevisions.pageId))
    .where(eq(aiConversationMessages.conversationId, conversationId))
    .orderBy(asc(aiConversationMessages.createdAt));

  const messageMap = new Map<string, MessageWithCitations>();
  for (const row of rows) {
    const msgId = row.message.id;
    if (!messageMap.has(msgId)) {
      messageMap.set(msgId, { ...row.message, citations: [] });
    }
    if (row.citation?.id) {
      messageMap.get(msgId)!.citations.push({
        id: row.citation.id,
        pageRevisionId: row.citation.pageRevisionId,
        excerptLocator: row.citation.excerptLocator,
        orderIndex: row.citation.orderIndex,
        pageId: row.page?.id ?? undefined,
        pageSlug: row.page?.path ?? undefined,
        pageTitle: row.page?.title ?? undefined,
      });
    }
  }

  return Array.from(messageMap.values());
}

export async function createUserMessage(
  conversationId: string,
  body: string,
  actor: PermissionContext,
): Promise<MessageRow> {
  await getConversation(conversationId, actor);
  const db = getDb();
  const [message] = await db
    .insert(aiConversationMessages)
    .values({ conversationId, role: "user", body })
    .returning();
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));
  return message!;
}

export async function createAssistantMessage(
  conversationId: string,
  body: string,
  citations: Array<{ pageRevisionId: string; excerptLocator?: string; orderIndex: number }>,
  actor: PermissionContext,
): Promise<MessageWithCitations> {
  await getConversation(conversationId, actor);
  const db = getDb();
  const [message] = await db
    .insert(aiConversationMessages)
    .values({ conversationId, role: "assistant", body })
    .returning();
  const msg = message!;

  let insertedCitations: (typeof aiCitations.$inferSelect)[] = [];
  if (citations.length > 0) {
    insertedCitations = await db
      .insert(aiCitations)
      .values(
        citations.map((c) => ({
          messageId: msg.id,
          pageRevisionId: c.pageRevisionId,
          excerptLocator: c.excerptLocator ?? null,
          orderIndex: c.orderIndex,
        })),
      )
      .returning();
  }

  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));

  const citationDetails: MessageWithCitations["citations"] = [];
  if (insertedCitations.length > 0) {
    const revisionIds = insertedCitations.map((c) => c.pageRevisionId);
    const revisionRows = await db
      .select({
        revisionId: pageRevisions.id,
        pageId: pages.id,
        pagePath: pages.path,
        pageTitle: pages.title,
      })
      .from(pageRevisions)
      .leftJoin(pages, eq(pages.id, pageRevisions.pageId))
      .where(inArray(pageRevisions.id, revisionIds));

    const revMap = new Map(revisionRows.map((r) => [r.revisionId, r]));
    for (const c of insertedCitations) {
      const rev = revMap.get(c.pageRevisionId);
      citationDetails.push({
        id: c.id,
        pageRevisionId: c.pageRevisionId,
        excerptLocator: c.excerptLocator,
        orderIndex: c.orderIndex,
        pageId: rev?.pageId ?? undefined,
        pageSlug: rev?.pagePath ?? undefined,
        pageTitle: rev?.pageTitle ?? undefined,
      });
    }
  }

  return { ...msg, citations: citationDetails };
}
