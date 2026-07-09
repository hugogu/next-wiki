import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { isHtmlPageRequest } from './page-request';

function makeRequest(method: string, accept: string): NextRequest {
  return new NextRequest('http://localhost:3000/docs', {
    method,
    headers: { accept },
  });
}

describe('isHtmlPageRequest', () => {
  it('returns true for GET requests that accept HTML', () => {
    expect(isHtmlPageRequest(makeRequest('GET', 'text/html,application/xhtml+xml'))).toBe(true);
  });

  it('returns false for non-GET requests', () => {
    expect(isHtmlPageRequest(makeRequest('POST', 'text/html'))).toBe(false);
  });

  it('returns false for JSON/API requests', () => {
    expect(isHtmlPageRequest(makeRequest('GET', 'application/json'))).toBe(false);
  });

  it('returns false for RSC data requests', () => {
    expect(isHtmlPageRequest(makeRequest('GET', 'text/x-component'))).toBe(false);
  });

  it('returns false when no accept header is present', () => {
    expect(isHtmlPageRequest(new NextRequest('http://localhost:3000/docs'))).toBe(false);
  });
});
