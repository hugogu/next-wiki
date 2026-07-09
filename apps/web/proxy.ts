import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPageRequest } from '@/server/proxy/page-request';

const AUDIT_START_HEADER = 'x-audit-start';
const AUDIT_PATH_HEADER = 'x-audit-path';

export function proxy(request: NextRequest) {
  if (!isPageRequest(request)) {
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
      source: '/((?!api|_next/static|_next/image|_static|_vercel|.*\\.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|webp|mp4|webm|pdf)).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
