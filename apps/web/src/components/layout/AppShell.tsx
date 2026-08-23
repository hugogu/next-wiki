'use client';

import { useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import { DemoReadonlyBanner } from './DemoReadonlyBanner';
import type { AppShellProps } from './types';
import { AiChatPane, aiChatPaneAvailable } from '@/components/chat/AiChatPane';
import { readChatKeyFromUrl } from '@/components/chat/chat-url';
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
  demoReadOnly = false,
  userCenter = false,
  fitViewport = false,
  aiEntitlements: initialAiEntitlements,
  staticPublic = false,
  footer,
  siteName,
  children,
  space = 'wiki',
  routePrefix,
  writingMode: initialWritingMode,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState<Actor>(initialUser);
  const [aiEntitlements, setAiEntitlements] = useState<AiEntitlementView | null | undefined>(initialAiEntitlements);
  const [writingMode, setWritingMode] = useState<WritingMode | undefined>(initialWritingMode);
  const [aiMaximized, setAiMaximized] = useState(false);

  // A `?chat=` link points at a conversation, and conversations are browsed
  // from the maximized pane (the sidebar only becomes the history list there),
  // so arriving on one opens that view — but only once the pane can actually
  // render. Where it cannot (AI off for the instance or this account), the
  // maximized layout would leave the sidebar in history mode with no control
  // anywhere to leave it. Availability can also arrive late (a staticPublic
  // document hydrates its real visitor), hence the effect re-runs rather than
  // reading the address once on mount.
  // Opening the pane is the pane's own job: it has to wait for its store to
  // rehydrate first, which this effect cannot see.
  const arrivalHandledRef = useRef(false);
  useEffect(() => {
    if (arrivalHandledRef.current || !aiChatPaneAvailable(aiEntitlements)) return;
    if (!readChatKeyFromUrl(window.location.search)) return;
    arrivalHandledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address bar can only be read after mount, so SSR/hydration render the un-maximized shell first
    setAiMaximized(true);
  }, [aiEntitlements]);

  useEffect(() => {
    // A staticPublic document was rendered against a placeholder anonymous
    // actor (see Layout.tsx) — it never reflects the real visitor, so this is
    // the only case that needs a client-side correction. Dynamically
    // rendered pages already resolved the real actor server-side (including
    // a genuinely logged-out visitor), so there's nothing to re-check there.
    if (!staticPublic) return;
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
  }, [staticPublic]);

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
          // A staticPublic document was rendered against an anonymous
          // placeholder actor (see Layout.tsx), so its canEdit can't reflect
          // the real visitor. Only override with this coarse role heuristic
          // when that's the case; a dynamically-rendered page's canEdit is
          // already authoritative and must not be widened here. Either way
          // the edit route re-verifies real authorization server-side.
          canEdit: pageContext.canEdit || (staticPublic && (user.role === 'admin' || user.role === 'editor')),
        }
      : pageContext;

  return (
    <AiAvailabilityProvider value={aiEntitlements ?? null}>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
        <Header user={user} pageContext={resolvedPageContext} onMenuClick={() => setNavOpen(true)} siteName={siteName} />
        {admin && demoReadOnly && <DemoReadonlyBanner />}
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
            routePrefix={routePrefix}
            writingMode={writingMode}
            aiChatMaximized={aiMaximized}
          />
          {/* Keep exactly one vertical scroll container.  The content wrapper
              lets min-height pages size against the area above the site footer
              instead of pushing the footer into a blank second screen. */}
          {aiMaximized && aiChatPaneAvailable(aiEntitlements) ? (
            <AiChatPane
              entitlements={aiEntitlements}
              pageContext={resolvedPageContext}
              maximized={aiMaximized}
              onMaximizedChange={setAiMaximized}
              anonymous={user.kind === 'anonymous'}
            />
          ) : (
            <main className="min-h-0 min-w-0 flex-1 relative flex flex-col">
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain flex flex-col">
                {/* Keep exactly one vertical scroll container.  The content wrapper
                    lets min-height pages size against the area above the site footer
                    instead of pushing the footer into a blank second screen. */}
                <div className={fitViewport ? 'h-full min-w-0 shrink-0' : 'grow shrink-0 basis-auto'}>
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
                  <PageEditProvider
                    value={{ canEdit: resolvedPageContext?.canEdit ?? false, pageId: resolvedPageContext?.pageId }}
                  >
                    {children}
                  </PageEditProvider>
                </div>
                {footer}
              </div>
            </main>
          )}
          {!aiMaximized && aiChatPaneAvailable(aiEntitlements) && (
            <AiChatPane
              entitlements={aiEntitlements}
              pageContext={resolvedPageContext}
              maximized={aiMaximized}
              onMaximizedChange={setAiMaximized}
              anonymous={user.kind === 'anonymous'}
            />
          )}
        </div>
      </div>
    </AiAvailabilityProvider>
  );
}
