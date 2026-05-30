"use client";

import { useState, useCallback, useRef } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  citations: Array<{
    id: string;
    pageRevisionId: string;
    excerptLocator: string | null;
    orderIndex: number;
    pageSlug?: string;
    pageTitle?: string;
  }>;
};

export type StreamState = "idle" | "streaming" | "error";

export function useChatStream(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (streamState === "streaming") return;

      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-assistant-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: tempUserId, role: "user", body: userMessage, citations: [] },
        { id: tempAssistantId, role: "assistant", body: "", citations: [] },
      ]);
      setStreamState("streaming");
      setErrorMessage(null);

      abortRef.current = new AbortController();

      try {
        const resp = await fetch("/api/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, userMessage }),
          signal: abortRef.current.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
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
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const chunk = JSON.parse(raw) as {
                type: string;
                content?: string;
                messageId?: string;
                message?: string;
              };
              if (chunk.type === "text" && chunk.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempAssistantId
                      ? { ...m, body: m.body + chunk.content }
                      : m,
                  ),
                );
              } else if (chunk.type === "done" && chunk.messageId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tempAssistantId ? { ...m, id: chunk.messageId! } : m,
                  ),
                );
              } else if (chunk.type === "error") {
                setErrorMessage(chunk.message ?? "Unknown error");
              }
            } catch {
              // malformed SSE line
            }
          }
        }
        setStreamState("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreamState("idle");
          return;
        }
        setStreamState("error");
        setErrorMessage(err instanceof Error ? err.message : "Stream failed");
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
      }
    },
    [conversationId, streamState],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadMessages = useCallback(
    async (existingMessages: ChatMessage[]) => {
      setMessages(existingMessages);
    },
    [],
  );

  return { messages, streamState, errorMessage, sendMessage, cancelStream, loadMessages };
}
