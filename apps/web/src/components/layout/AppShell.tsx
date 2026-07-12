'use client';

import { useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import type { AppShellProps } from './types';
import { AiChatPane } from '@/components/chat/AiChatPane';
import { AiAvailabilityProvider } from '@/components/ai/AiAvailabilityContext';

export function AppShell({ user, tree, pageContext, admin = false, userCenter = false, fitViewport = false, aiEntitlements, footer, siteName, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <AiAvailabilityProvider value={aiEntitlements ?? null}>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <Header user={user} pageContext={pageContext} onMenuClick={() => setNavOpen(true)} siteName={siteName} />
        <div className="min-h-0 flex-1 flex overflow-hidden">
          <Navigator
            tree={tree}
            admin={admin}
            userCenter={userCenter}
            currentPath={pageContext?.path}
            isOpen={navOpen}
            onClose={() => setNavOpen(false)}
            user={user}
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
                {children}
              </div>
              {footer}
            </div>
          </main>
          {aiEntitlements && !admin && <AiChatPane entitlements={aiEntitlements} pageContext={pageContext} />}
        </div>
      </div>
    </AiAvailabilityProvider>
  );
}
