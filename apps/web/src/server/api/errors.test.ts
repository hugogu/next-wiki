import { describe, expect, it } from 'vitest';
import { DomainError } from '@/server/errors';
import { apiError, internalError, mapDomainError } from './errors';

describe('API error responses', () => {
  it('disables caching for direct, domain, and internal errors', () => {
    expect(apiError('BAD_REQUEST', 'Invalid input', 400).headers.get('cache-control')).toBe(
      'no-store',
    );
    expect(
      mapDomainError(new DomainError('FORBIDDEN', 'Forbidden')).headers.get('cache-control'),
    ).toBe('no-store');
    expect(internalError().headers.get('cache-control')).toBe('no-store');
  });
});
