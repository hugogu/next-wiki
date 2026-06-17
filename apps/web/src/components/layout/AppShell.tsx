'use client';

import { useState } from 'react';
import { Header } from './Header';
import { Navigator } from './Navigator';
import type { AppShellProps } from './types';

export function AppShell({ user, pages, pageContext, admin = false, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header user={user} pageContext={pageContext} onMenuClick={() => setNavOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        <Navigator
          pages={pages}
          admin={admin}
          currentPath={pageContext?.path}
          isOpen={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <main className="flex-1 overflow-auto relative">
          {children}
        </main>
      </div>
    </div>
  );
}
