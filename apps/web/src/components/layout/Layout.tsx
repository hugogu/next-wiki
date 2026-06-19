import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import * as authService from '@/server/services/auth';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { AppShell } from './AppShell';
import type { PageContext } from './types';

export async function Layout({
  children,
  pageContext,
  admin = false,
  userCenter = false,
  skipPasswordGate = false,
}: {
  children: ReactNode;
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  skipPasswordGate?: boolean;
}) {
  const actor = await authService.getCurrentActor();

  if (!skipPasswordGate && actor.kind === 'user') {
    const needsReset = await authService.mustResetPassword({ actor });
    if (needsReset) {
      redirect('/auth/set-password');
    }
  }

  const pages = await pageService.listPublished(buildAnonymousCtx());

  return (
    <AppShell user={actor} pages={pages} pageContext={pageContext} admin={admin} userCenter={userCenter}>
      {children}
    </AppShell>
  );
}
