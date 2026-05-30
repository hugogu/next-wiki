"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStream, type ChatMessage } from "@/hooks/use-chat-stream";
import { AiCitationList } from "./ai-citation-list";

interface AiChatPaneProps {
  conversationId: string;
  initialMessages?: ChatMessage[];
  onClose?: () => void;
}

export function AiChatPane({ conversationId, initialMessages = [], onClose }: AiChatPaneProps) {
  const { messages, streamState, errorMessage, sendMessage, cancelStream, loadMessages } =
    useChatStream(conversationId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialMessages.length > 0) {
      void loadMessages(initialMessages);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streamState === "streaming") return;
    setInput("");
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">AI Assistant</span>
        <div className="flex items-center gap-2">
          {streamState === "streaming" && (
            <button
              onClick={cancelStream}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Stop
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-secondary"
              aria-label="Close chat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Ask a question about this wiki.
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {streamState === "streaming" && messages[messages.length - 1]?.body === "" && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span className="animate-pulse">Thinking…</span>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {errorMessage && (
        <div className="border-t border-danger-200 bg-danger-50 px-4 py-2 text-xs text-danger-700">
          {errorMessage}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send)"
            rows={2}
            className="flex-1 resize-none rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            disabled={streamState === "streaming"}
          />
          <button
            type="submit"
            disabled={streamState === "streaming" || !input.trim()}
            className="rounded bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary-600 text-white"
            : "bg-neutral-100 text-text-primary"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        {!isUser && <AiCitationList citations={message.citations} />}
      </div>
    </div>
  );
}
