import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUDIT_START_HEADER = 'x-audit-start';
const AUDIT_PATH_HEADER = 'x-audit-path';

export function proxy(request: NextRequest) {
  if (request.method !== 'GET') {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(AUDIT_START_HEADER, String(Date.now()));
  requestHeaders.set(AUDIT_PATH_HEADER, request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    {
      // Match all page paths, excluding API routes, Next.js static assets,
      // and resource files. Both HTML page loads and RSC client-side
      // navigations are GET requests that match this source.
      source:
        '/((?!api|_next/static|_next/image|_static|_vercel|.*\\.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|webp|mp4|webm|pdf)).*)',
      // Exclude hover/link prefetches so they don't create log entries.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
