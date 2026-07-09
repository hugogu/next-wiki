import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { isPageRequest } from './page-request';

function makeRequest(method: string, accept: string): NextRequest {
  return new NextRequest('http://localhost:3000/docs', {
    method,
    headers: { accept },
  });
}

describe('isPageRequest', () => {
  it('returns true for GET requests that accept HTML', () => {
    expect(isPageRequest(makeRequest('GET', 'text/html,application/xhtml+xml'))).toBe(true);
  });

  it('returns true for RSC data requests (client navigation)', () => {
    expect(isPageRequest(makeRequest('GET', 'text/x-component'))).toBe(true);
  });

  it('returns false for non-GET requests', () => {
    expect(isPageRequest(makeRequest('POST', 'text/html'))).toBe(false);
  });

  it('returns false for JSON/API requests', () => {
    expect(isPageRequest(makeRequest('GET', 'application/json'))).toBe(false);
  });

  it('returns false when no accept header is present', () => {
    expect(isPageRequest(new NextRequest('http://localhost:3000/docs'))).toBe(false);
  });
});
