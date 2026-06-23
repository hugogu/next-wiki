'use client';

import { useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import type { AppShellProps } from './types';
import { AiChatPane } from '@/components/chat/AiChatPane';
import { AiAvailabilityProvider } from '@/components/ai/AiAvailabilityContext';

export function AppShell({ user, pages, pageContext, admin = false, userCenter = false, aiEntitlements, footer, siteName, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <AiAvailabilityProvider value={aiEntitlements ?? null}>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <Header user={user} pageContext={pageContext} onMenuClick={() => setNavOpen(true)} siteName={siteName} />
        <div className="flex-1 flex overflow-hidden">
          <Navigator
            pages={pages}
            admin={admin}
            userCenter={userCenter}
            currentPath={pageContext?.path}
            isOpen={navOpen}
            onClose={() => setNavOpen(false)}
          />
          <main className="flex-1 overflow-auto relative flex flex-col">
            <div className="flex-1">{children}</div>
            {footer}
          </main>
          {aiEntitlements && !admin && <AiChatPane entitlements={aiEntitlements} pageContext={pageContext} />}
        </div>
      </div>
    </AiAvailabilityProvider>
  );
}
