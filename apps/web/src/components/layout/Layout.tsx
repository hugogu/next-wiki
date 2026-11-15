import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import * as authService from '@/server/services/auth';
import { getCachedPageNavigation, getPageNavigation } from '@/server/services/page-navigation';
import { getPreferences } from '@/server/services/user-center';
import { AppShell } from './AppShell';
import type { PageContext } from './types';
import { buildAnonymousCtx, isDemoReadOnly } from '@/server/permissions';
import { getAnonymousQuestionEntitlements, getMyEntitlements } from '@/server/services/ai-entitlements';
import { getSiteView } from '@/server/services/site-settings';
import { Footer } from '@/components/ui/Footer';
import { sparsifyTree } from '@/lib/page-tree';
import type { ReaderSpace } from '@/lib/path';
import { getMode } from '@/server/services/writing-mode';
import { getLocale, getStaticLocale } from '@/i18n/server';

export async function Layout({
  children,
  pageContext,
  admin = false,
  userCenter = false,
  fitViewport = false,
  skipPasswordGate = false,
  staticPublic = false,
  space,
  routePrefix,
  navigationPath,
}: {
  children: ReactNode;
  pageContext?: PageContext;
  admin?: boolean;
  userCenter?: boolean;
  fitViewport?: boolean;
  skipPasswordGate?: boolean;
  staticPublic?: boolean;
  space?: ReaderSpace;
  routePrefix?: string;
  navigationPath?: string;
}) {
  // staticPublic output is cached and shared by every visitor (ISR). Resolving
  // the real per-request session here would bake one visitor's identity into
  // that shared cache for everyone else; real identity is only ever
  // established client-side afterward via AppShell's /api/auth/me hydration.
  const actor = staticPublic ? buildAnonymousCtx().actor : await authService.getCurrentActor();

  if (!skipPasswordGate && actor.kind === 'user') {
    const needsReset = await authService.mustResetPassword({ actor });
    if (needsReset) {
      redirect('/auth/set-password');
    }
  }

  const navigationMode = !staticPublic && actor.kind === 'user'
    ? (await getPreferences({ actor }))?.navigationMode ?? 'tree'
    : 'tree';
  const currentPath = navigationPath ?? pageContext?.path ?? '';
  const query = { path: currentPath, mode: navigationMode, space: space ?? 'wiki', status: 'all' as const };
  const treeResult = admin || userCenter ? null : actor.kind === 'anonymous'
    ? await getCachedPageNavigation(query)
    : await getPageNavigation({ actor }, query);
  const tree = treeResult ? sparsifyTree(treeResult.root, currentPath) : [];
  const aiEntitlements =
    actor.kind === 'user'
      ? await getMyEntitlements({ actor }).catch(() => null)
      : await getAnonymousQuestionEntitlements().catch(() => null);
  const site = await getSiteView();
  const writingMode = staticPublic ? undefined : await getMode();
  // staticPublic output is cached/shared (see actor note above): resolve the
  // request-independent locale rather than reading the per-visitor cookie.
  const locale = staticPublic ? getStaticLocale() : await getLocale();

  return (
    <AppShell
      user={actor}
      tree={tree}
      navigationMode={navigationMode}
      navigationPath={navigationPath}
      pageContext={pageContext}
      admin={admin}
      demoReadOnly={admin ? isDemoReadOnly() : false}
      userCenter={userCenter}
      fitViewport={fitViewport}
      aiEntitlements={aiEntitlements}
      staticPublic={staticPublic}
      space={space}
      routePrefix={routePrefix}
      writingMode={writingMode}
      footer={<Footer site={site} locale={locale} />}
      siteName={site.siteName}
    >
      {children}
    </AppShell>
  );
}
