import { describe, expect, it } from 'vitest';
import { DetectorError, detectorCodeForStatus, normalizeDetectorError } from './types';

describe('detector error normalization', () => {
  it('maps HTTP statuses to safe codes', () => {
    expect(detectorCodeForStatus(401)).toBe('AUTHENTICATION_FAILED');
    expect(detectorCodeForStatus(403)).toBe('PERMISSION_DENIED');
    expect(detectorCodeForStatus(429)).toBe('RATE_LIMITED');
    expect(detectorCodeForStatus(408)).toBe('TIMEOUT');
    expect(detectorCodeForStatus(503)).toBe('PROVIDER_UNAVAILABLE');
    expect(detectorCodeForStatus(422)).toBe('INVALID_RESPONSE');
  });

  it('redacts bearer tokens and api keys from error messages', () => {
    const error = new DetectorError('AUTHENTICATION_FAILED', 'Failed with Bearer cf-secret-token-123');
    expect(error.message).not.toContain('cf-secret-token-123');
    expect(error.message).toContain('[REDACTED]');
  });

  it('truncates overly long messages', () => {
    const error = new DetectorError('INVALID_RESPONSE', 'x'.repeat(2_000));
    expect(error.message.length).toBeLessThanOrEqual(500);
  });

  it('marks rate-limit/timeout/unavailable codes retryable by default', () => {
    expect(new DetectorError('RATE_LIMITED', 'slow down').retryable).toBe(true);
    expect(new DetectorError('AUTHENTICATION_FAILED', 'bad key').retryable).toBe(false);
  });

  it('normalizes an abort into a CANCELLED error', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(normalizeDetectorError(abort).code).toBe('CANCELLED');
  });

  it('passes through an existing DetectorError unchanged', () => {
    const original = new DetectorError('PERMISSION_DENIED', 'nope');
    expect(normalizeDetectorError(original)).toBe(original);
  });

  it('falls back to PROVIDER_UNAVAILABLE for unknown errors', () => {
    expect(normalizeDetectorError(new Error('weird')).code).toBe('PROVIDER_UNAVAILABLE');
  });
});
