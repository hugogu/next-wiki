import type { NextRequest } from 'next/server';

export function isHtmlPageRequest(request: NextRequest): boolean {
  if (request.method !== 'GET') return false;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html');
}
