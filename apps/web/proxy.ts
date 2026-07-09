import { NextResponse, type NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveActorFromSession, SESSION_COOKIE } from '@/server/services/auth';
import * as audit from '@/server/services/audit';
import { isHtmlPageRequest } from '@/server/proxy/page-request';

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isHtmlPageRequest(request)) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;

  // Best-effort page audit logging; don't block the request.
  event.waitUntil(
    (async () => {
      const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
      let userId: string | null = null;
      let authStatus: 'authenticated' | 'anonymous' = 'anonymous';

      if (sessionCookie) {
        const actor = await resolveActorFromSession(sessionCookie);
        if (actor?.kind === 'user') {
          userId = actor.userId;
          authStatus = 'authenticated';
        }
      }

      await audit.writeEntry({
        keyId: null,
        userId,
        entryType: 'page',
        method: 'GET',
        path,
        statusCode: 200,
        durationMs: 0,
        authStatus,
        errorMessage: null,
      });
    })().catch(() => {
      // Ignore audit logging failures so a logging problem never breaks pages.
    }),
  );

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude API routes, Next.js internals, static files, and well-known
    // assets. Page paths with file extensions are skipped to avoid logging CSS,
    // JS, images, fonts, etc.
    '/((?!api|_next|_static|_vercel|.*\\..*).*)',
  ],
};
