"use client";

import { useState } from "react";
import { AiChatPane } from "./ai-chat-pane";

interface ChatLauncherProps {
  conversationId: string;
  contextType?: "global" | "space" | "page";
  contextId?: string;
}

export function ChatLauncher({ conversationId }: ChatLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-neutral-50 hover:text-text-primary"
        aria-label="Open AI chat"
      >
        <span>✦</span>
        <span>Ask AI</span>
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col shadow-xl">
          <AiChatPane
            conversationId={conversationId}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
