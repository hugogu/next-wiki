import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiConversations } from "@/server/db/schema/ai";
import { ForbiddenError, NotFoundError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

export type ConversationRow = typeof aiConversations.$inferSelect;

export async function listConversations(
  actor: PermissionContext,
  options?: { includeAll?: boolean },
): Promise<ConversationRow[]> {
  const db = getDb();
  if (options?.includeAll && actor.isAdmin) {
    return db.select().from(aiConversations).orderBy(desc(aiConversations.updatedAt)).limit(50);
  }
  if (!actor.userId) return [];
  return db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.userId, actor.userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(50);
}

export async function getConversation(id: string, actor: PermissionContext): Promise<ConversationRow> {
  const db = getDb();
  const rows = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundError("AiConversation", id);
  const conversation = rows[0]!;
  if (!actor.isAdmin && conversation.userId !== actor.userId) {
    throw new ForbiddenError("read conversation");
  }
  return conversation;
}

export async function createConversation(
  input: { contextType?: "global" | "space" | "page"; contextId?: string; title?: string },
  actor: PermissionContext,
): Promise<ConversationRow> {
  if (!actor.userId) throw new ForbiddenError("create conversation");
  const db = getDb();
  const [row] = await db
    .insert(aiConversations)
    .values({
      userId: actor.userId,
      contextType: input.contextType ?? "global",
      contextId: input.contextId ?? null,
      title: input.title ?? null,
    })
    .returning();
  return row!;
}

export async function deleteConversation(id: string, actor: PermissionContext): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundError("AiConversation", id);
  const conversation = rows[0]!;
  if (!actor.isAdmin && conversation.userId !== actor.userId) {
    throw new ForbiddenError("delete conversation");
  }
  await db.delete(aiConversations).where(eq(aiConversations.id, id));
}
