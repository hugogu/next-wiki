import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import * as authService from '@/server/services/auth';
import * as publicContent from '@/server/services/public-content';
import { buildAnonymousCtx } from '@/server/permissions';
import { AppShell } from './AppShell';
import type { PageContext } from './types';
import { getMyEntitlements } from '@/server/services/ai-entitlements';
import { getSiteView } from '@/server/services/site-settings';
import { Footer } from '@/components/ui/Footer';
import { sparsifyTree } from '@/lib/page-tree';

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

  // Sidebar page tree: ship only top-level nodes plus the full subtree of
  // every node that lies on the current page's ancestor chain. Other branches
  // start collapsed with a `hasChildren` flag so the client can lazy-load them
  // on expand via `/api/v1/tree?pathPrefix=…`. This keeps the initial HTML
  // payload proportional to sidebar depth instead of wiki size.
  const treeResult = await publicContent.getPageTree(buildAnonymousCtx(), {
    status: 'published',
  });
  const tree = sparsifyTree(treeResult.root, pageContext?.path);
  const aiEntitlements =
    actor.kind === 'user'
      ? await getMyEntitlements({ actor }).catch(() => null)
      : null;
  const site = await getSiteView();

  return (
    <AppShell
      user={actor}
      tree={tree}
      pageContext={pageContext}
      admin={admin}
      userCenter={userCenter}
      aiEntitlements={aiEntitlements}
      footer={<Footer site={site} />}
      siteName={site.siteName}
    >
      {children}
    </AppShell>
  );
}
