import { describe, expect, it, vi, afterEach } from 'vitest';
import { DomainError } from '@/server/errors';
import { apiError, handleApiError, internalError, mapDomainError } from './errors';

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

describe('handleApiError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a DomainError to its status code without logging it as an error', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = handleApiError(new DomainError('NOT_FOUND', 'Page not found'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'NOT_FOUND', message: 'Page not found' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs an unexpected exception with its stack and returns a generic 500', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = handleApiError(new Error('unexpected failure'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.parse(logSpy.mock.calls[0]![1] as string);
    expect(loggedJson.error.stack).toContain('unexpected failure');
  });
});
