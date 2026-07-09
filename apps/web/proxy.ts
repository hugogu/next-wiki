import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isHtmlPageRequest } from '@/server/proxy/page-request';

const AUDIT_START_HEADER = 'x-audit-start';
const AUDIT_PATH_HEADER = 'x-audit-path';

export function proxy(request: NextRequest) {
  if (!isHtmlPageRequest(request)) {
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
    // Exclude API routes, Next.js internals, static files, and well-known
    // assets. Page paths with file extensions are skipped to avoid logging CSS,
    // JS, images, fonts, etc.
    '/((?!api|_next|_static|_vercel|.*\\..*).*)',
  ],
};
