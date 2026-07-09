import type { NextRequest } from 'next/server';

export function isPageRequest(request: NextRequest): boolean {
  if (request.method !== 'GET') return false;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html') || accept.includes('text/x-component');
}
