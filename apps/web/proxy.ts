import { NextResponse, type NextFetchEvent } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveActorFromSession, SESSION_COOKIE } from '@/server/services/auth';
import * as audit from '@/server/services/audit';
import { isReservedSpacePrefix } from '@/server/services/space-routes';

export function isExternalReaderPath(pathname: string): boolean {
  if (
    pathname === '/'
    || pathname.startsWith('/_next/')
    || pathname.endsWith('.md')
    || pathname.split('/').some((segment) => segment.includes('.'))
  ) return false;
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  return Boolean(firstSegment && !isReservedSpacePrefix(firstSegment));
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.method !== 'GET') {
    return NextResponse.next();
  }

  const start = Date.now();
  const path = request.nextUrl.pathname;
  const ip = audit.clientIp(request.headers);
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const isReaderPath = isExternalReaderPath(path);

  // A session lookup is only on the response path when it is needed to select
  // the registered reader. Other audit lookups stay inside waitUntil.
  const readerActor = sessionCookie && isReaderPath
    ? await resolveActorFromSession(sessionCookie)
    : null;

  // Best-effort page audit logging via waitUntil so it runs after the response
  // is sent without blocking it. This catches both full page loads (HTML) and
  // client-side navigations (RSC data requests).
  event.waitUntil(
    (async () => {
      let userId: string | null = null;
      let authStatus: 'authenticated' | 'anonymous' = 'anonymous';

      const actor = readerActor ?? (sessionCookie ? await resolveActorFromSession(sessionCookie) : null);
      if (actor?.kind === 'user') {
        userId = actor.userId;
        authStatus = 'authenticated';
      }

      await audit.writeEntry({
        keyId: null,
        userId,
        entryType: 'page',
        method: 'GET',
        path,
        statusCode: 200,
        durationMs: Date.now() - start,
        authStatus,
        errorMessage: null,
        ip,
      });
    })().catch(() => {
      // Ignore audit logging failures so a logging problem never breaks pages.
    }),
  );

  if (readerActor?.kind === 'user') {
    const destination = request.nextUrl.clone();
    destination.pathname = `/registered-reader${path}`;
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      // Match all page paths, excluding API routes, Next.js static assets,
      // and resource files. Both HTML page loads and RSC client-side
      // navigations are GET requests that match this source.
      source:
        '/((?!api|_next|_static|_vercel|.*\\.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|webp|mp4|webm|pdf)).*)',
      // Exclude hover/link prefetches so they don't create log entries.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
