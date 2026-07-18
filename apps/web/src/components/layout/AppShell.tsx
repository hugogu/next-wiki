'use client';

import { useEffect, useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import type { AppShellProps } from './types';
import { AiChatPane } from '@/components/chat/AiChatPane';
import { AiAvailabilityProvider } from '@/components/ai/AiAvailabilityContext';
import { PageEditProvider } from '@/components/pages/PageEditContext';
import type { Actor } from '@/server/permissions';
import type { AiEntitlementView } from '@next-wiki/shared';
import type { WritingMode } from '@next-wiki/shared';

type SessionUser = {
  id: string;
  role: 'admin' | 'editor' | 'reader';
};

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown; role?: unknown };
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'admin' || candidate.role === 'editor' || candidate.role === 'reader')
  );
}

export function AppShell({
  user: initialUser,
  tree,
  pageContext,
  admin = false,
  userCenter = false,
  fitViewport = false,
  aiEntitlements: initialAiEntitlements,
  hydrateSession = false,
  footer,
  siteName,
  children,
  space = 'wiki',
  writingMode: initialWritingMode,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState<Actor>(initialUser);
  const [aiEntitlements, setAiEntitlements] = useState<AiEntitlementView | null | undefined>(initialAiEntitlements);
  const [writingMode, setWritingMode] = useState<WritingMode | undefined>(initialWritingMode);

  useEffect(() => {
    if (!hydrateSession) return;
    let cancelled = false;

    async function hydratePrivateControls() {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!response.ok || cancelled) return;
        const sessionUser: unknown = await response.json();
        if (!isSessionUser(sessionUser) || cancelled) return;

        setUser({ kind: 'user', userId: sessionUser.id, role: sessionUser.role });

        const entitlementResponse = await fetch('/api/ai/entitlements/me', {
          credentials: 'same-origin',
        });
        if (entitlementResponse.ok && !cancelled) {
          setAiEntitlements((await entitlementResponse.json()) as AiEntitlementView);
        }
      } catch {
        // The public document remains usable when an optional session request
        // fails; server-side authorization still protects every action.
      }
    }

    void hydratePrivateControls();
    return () => {
      cancelled = true;
    };
  }, [hydrateSession]);

  useEffect(() => {
    if (user.kind !== 'user' || user.role !== 'admin') return;
    let cancelled = false;

    async function refreshWritingMode() {
      try {
        const response = await fetch('/api/settings/writing-mode', {
          credentials: 'same-origin',
        });
        if (!response.ok || cancelled) return;
        const settings = (await response.json()) as { mode?: unknown };
        if ((settings.mode === 'copilot' || settings.mode === 'llm-wiki') && !cancelled) {
          setWritingMode(settings.mode);
        }
      } catch {
        // Server-rendered mode state remains usable when this optional refresh fails.
      }
    }

    void refreshWritingMode();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const resolvedPageContext =
    pageContext && user.kind === 'user'
      ? {
          ...pageContext,
          // The static document cannot know page-specific permissions. This
          // only controls visibility; the edit route verifies authorization.
          canEdit: pageContext.canEdit || (hydrateSession && (user.role === 'admin' || user.role === 'editor')),
        }
      : pageContext;

  return (
    <AiAvailabilityProvider value={aiEntitlements ?? null}>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <Header user={user} pageContext={resolvedPageContext} onMenuClick={() => setNavOpen(true)} siteName={siteName} />
        <div className="min-h-0 flex-1 flex overflow-hidden">
          <Navigator
            tree={tree}
            admin={admin}
            userCenter={userCenter}
            currentPath={resolvedPageContext?.path}
            isOpen={navOpen}
            onClose={() => setNavOpen(false)}
            user={user}
            space={space}
            writingMode={writingMode}
          />
          {/* Keep exactly one vertical scroll container.  The content wrapper
              lets min-height pages size against the area above the site footer
              instead of pushing the footer into a blank second screen. */}
          <main className="min-h-0 min-w-0 flex-1 relative flex flex-col">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain flex flex-col">
              {/* Two content-region modes:
                  - fitViewport (e.g. the split editor): h-full shrink-0 gives
                    the wrapper the full scroll-viewport height (not minus the
                    footer) so an h-full child fills the screen and owns its
                    internal scrollbars, while the footer is pushed just below
                    the fold and only appears when scrolled to the very bottom.
                  - default (reader/document pages): grow shrink-0 basis-auto
                    (flex: 1 0 auto) grows to push the footer to the viewport
                    bottom on short pages but never shrinks below content on
                    long ones, keeping the footer at the very bottom of the
                    flow instead of floating mid-content. */}
              <div className={fitViewport ? 'h-full min-w-0 shrink-0' : 'grow shrink-0 basis-auto'}>
                <PageEditProvider
                  value={{ canEdit: resolvedPageContext?.canEdit ?? false, pageId: resolvedPageContext?.pageId }}
                >
                  {children}
                </PageEditProvider>
              </div>
              {footer}
            </div>
          </main>
          {aiEntitlements && !admin && <AiChatPane entitlements={aiEntitlements} pageContext={resolvedPageContext} />}
        </div>
      </div>
    </AiAvailabilityProvider>
  );
}
