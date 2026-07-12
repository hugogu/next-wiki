'use client';

import { useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import type { AppShellProps } from './types';
import { AiChatPane } from '@/components/chat/AiChatPane';
import { AiAvailabilityProvider } from '@/components/ai/AiAvailabilityContext';

export function AppShell({ user, tree, pageContext, admin = false, userCenter = false, aiEntitlements, footer, siteName, children }: AppShellProps) {
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
          />
          {/* Keep exactly one vertical scroll container.  The content wrapper
              lets min-height pages size against the area above the site footer
              instead of pushing the footer into a blank second screen. */}
          <main className="min-h-0 flex-1 relative flex flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col">
              <div className="min-h-0 flex-1">
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
