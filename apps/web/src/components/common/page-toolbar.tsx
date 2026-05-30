"use client";

import { ChatLauncher } from "@/components/chat/chat-launcher";

interface PageToolbarProps {
  spaceKey: string;
  pageId?: string;
  canEdit?: boolean;
  editHref?: string;
  aiConversationId?: string;
  isAiEnabled?: boolean;
}

export function PageToolbar({
  spaceKey,
  pageId,
  canEdit,
  editHref,
  aiConversationId,
  isAiEnabled,
}: PageToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {canEdit && editHref && (
        <a
          href={editHref}
          className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-neutral-50 hover:text-text-primary"
        >
          Edit
        </a>
      )}

      {isAiEnabled && aiConversationId && (
        <ChatLauncher
          conversationId={aiConversationId}
          contextType="page"
          contextId={pageId}
        />
      )}
    </div>
  );
}
