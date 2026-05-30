import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pages, permissionRules, spaces } from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { getConversation } from "./conversation-service";
import { createAssistantMessage, createUserMessage, listMessages } from "./message-service";
import { findSimilarChunks } from "./knowledge-service";

export type AnswerChunk =
  | { type: "text"; content: string }
  | { type: "citation"; citationIndex: number; pageRevisionId: string; pageSlug: string; pageTitle: string }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

const SYSTEM_PROMPT =
  "You are a wiki assistant. Answer questions based on the provided wiki content. " +
  "For each fact you state, add a citation marker [1], [2], etc. referencing the source chunk.";

async function getPermittedPageIds(actor: PermissionContext): Promise<string[]> {
  const db = getDb();

  if (actor.isAdmin) {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.status, "published"))
      .limit(200);
    return rows.map((r) => r.id);
  }

  const allPublishedPages = await db
    .select({ id: pages.id, spaceId: pages.spaceId })
    .from(pages)
    .where(eq(pages.status, "published"))
    .limit(200);

  if (allPublishedPages.length === 0) return [];

  const pageIds = allPublishedPages.map((p) => p.id);
  const spaceIds = [...new Set(allPublishedPages.map((p) => p.spaceId))];

  const denyRules = await db
    .select({ resourceId: permissionRules.resourceId })
    .from(permissionRules)
    .where(
      and(
        eq(permissionRules.action, "read"),
        eq(permissionRules.effect, "deny"),
        or(
          and(
            eq(permissionRules.resourceType, "page"),
            inArray(permissionRules.resourceId, pageIds),
          ),
          and(
            eq(permissionRules.resourceType, "space"),
            inArray(permissionRules.resourceId, spaceIds),
          ),
        ),
      ),
    );

  const deniedResourceIds = new Set(denyRules.map((r) => r.resourceId).filter(Boolean) as string[]);

  let allowedIds = allPublishedPages
    .filter((p) => !deniedResourceIds.has(p.id) && !deniedResourceIds.has(p.spaceId))
    .map((p) => p.id);

  if (actor.groupIds.length > 0 || actor.userId) {
    const subjectConditions = [];
    if (actor.userId) {
      subjectConditions.push(
        and(
          eq(permissionRules.subjectType, "user"),
          eq(permissionRules.subjectId, actor.userId),
        ),
      );
    }
    if (actor.groupIds.length > 0) {
      subjectConditions.push(
        and(
          eq(permissionRules.subjectType, "group"),
          inArray(permissionRules.subjectId, actor.groupIds),
        ),
      );
    }

    const allowRules = await db
      .select({ resourceId: permissionRules.resourceId, resourceType: permissionRules.resourceType })
      .from(permissionRules)
      .where(
        and(
          eq(permissionRules.action, "read"),
          eq(permissionRules.effect, "allow"),
          or(...subjectConditions),
        ),
      );

    const allowedByRule = new Set<string>();
    for (const rule of allowRules) {
      if (rule.resourceId) allowedByRule.add(rule.resourceId);
    }

    const publicSpaceRows = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.isPublicByDefault, true),
          inArray(spaces.id, spaceIds),
        ),
      );

    const publicSpaceIds = new Set(publicSpaceRows.map((s) => s.id));

    allowedIds = allPublishedPages
      .filter((p) => {
        if (deniedResourceIds.has(p.id) || deniedResourceIds.has(p.spaceId)) return false;
        if (publicSpaceIds.has(p.spaceId)) return true;
        if (allowedByRule.has(p.id) || allowedByRule.has(p.spaceId)) return true;
        return false;
      })
      .map((p) => p.id);
  }

  return allowedIds;
}

async function* streamOpenAI(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}): AsyncGenerator<string> {
  const resp = await fetch(`${params.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({ model: params.model, messages: params.messages, stream: true }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI API error: ${resp.status}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

async function* streamAnthropic(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
}): AsyncGenerator<string> {
  const nonSystemMessages = params.messages.filter((m) => m.role !== "system");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 4096,
      system: params.systemPrompt,
      messages: nonSystemMessages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API error: ${resp.status}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      const parsed = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
        yield parsed.delta.text;
      }
    }
  }
}

async function* streamOllama(params: {
  endpoint: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}): AsyncGenerator<string> {
  const resp = await fetch(`${params.endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: params.model, messages: params.messages, stream: true }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama API error: ${resp.status}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
      };
      if (parsed.message?.content) yield parsed.message.content;
      if (parsed.done) return;
    }
  }
}

export async function* streamAnswer(params: {
  conversationId: string;
  userMessage: string;
  actor: PermissionContext;
}): AsyncGenerator<AnswerChunk> {
  await getConversation(params.conversationId, params.actor);

  const userMsg = await createUserMessage(params.conversationId, params.userMessage, params.actor);

  const { getActiveProvider, decryptCredentials } = await import("./provider-service");
  const provider = await getActiveProvider();

  if (!provider) {
    yield { type: "text", content: "AI is not configured. Please ask an administrator to set up an AI provider." };
    yield { type: "done", messageId: userMsg.id };
    return;
  }

  const allowedPageIds = await getPermittedPageIds(params.actor);

  const chunks = await findSimilarChunks({
    query: params.userMessage,
    providerId: provider.id,
    allowedPageIds,
    limit: 5,
  });

  const contextString = chunks
    .map((c, i) => `[${i + 1}] ${c.summary}`)
    .join("\n\n");

  const history = await listMessages(params.conversationId, params.actor);
  const recentHistory = history
    .filter((m) => m.id !== userMsg.id)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.body }));

  const credentials = provider.encryptedCredentials
    ? decryptCredentials(provider.encryptedCredentials)
    : {};

  const model = provider.defaultModel ?? "";

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(contextString
      ? [{ role: "system", content: `Relevant wiki content:\n\n${contextString}` }]
      : []),
    ...recentHistory,
    { role: "user", content: params.userMessage },
  ];

  let fullText = "";

  if (provider.providerType === "openai") {
    const baseUrl = provider.endpoint ?? "https://api.openai.com";
    const apiKey = credentials["apiKey"] ?? "";
    for await (const text of streamOpenAI({ baseUrl, apiKey, model, messages })) {
      fullText += text;
      yield { type: "text", content: text };
    }
  } else if (provider.providerType === "anthropic") {
    const apiKey = credentials["apiKey"] ?? "";
    for await (const text of streamAnthropic({ apiKey, model, messages, systemPrompt: SYSTEM_PROMPT })) {
      fullText += text;
      yield { type: "text", content: text };
    }
  } else if (provider.providerType === "ollama") {
    const endpoint = provider.endpoint ?? "http://localhost:11434";
    for await (const text of streamOllama({ endpoint, model, messages })) {
      fullText += text;
      yield { type: "text", content: text };
    }
  }

  const citationMarkers = [...fullText.matchAll(/\[(\d+)\]/g)];
  const usedIndices = [
    ...new Set(citationMarkers.map((m) => parseInt(m[1] ?? "0", 10))),
  ];

  const citationInputs = usedIndices
    .filter((idx) => idx >= 1 && idx <= chunks.length)
    .map((idx, order) => ({
      pageRevisionId: chunks[idx - 1]!.revisionId,
      orderIndex: order,
    }));

  const assistantMsg = await createAssistantMessage(
    params.conversationId,
    fullText,
    citationInputs,
    params.actor,
  );

  yield { type: "done", messageId: assistantMsg.id };
}
