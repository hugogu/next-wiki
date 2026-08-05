import { describe, expect, it } from 'vitest';
import {
  canonicalSpacePath,
  effectiveRoutePrefix,
  isReservedSpacePrefix,
  normalizeRoutePrefix,
  routePrefixValidationError,
} from './space-routes';

describe('space route prefixes', () => {
  it('uses stable non-empty defaults for legacy built-in spaces', () => {
    expect(effectiveRoutePrefix({ kind: 'wiki', routePrefix: null })).toBe('wiki');
    expect(effectiveRoutePrefix({ kind: 'generated', routePrefix: null })).toBe('generated');
    expect(effectiveRoutePrefix({ kind: 'raw', routePrefix: null })).toBe('raw');
  });

  it('normalizes a configured prefix and rejects ambiguous input', () => {
    expect(normalizeRoutePrefix(' Generated-Knowledge ')).toBe('generated-knowledge');
    expect(routePrefixValidationError('')).toMatch(/required/i);
    expect(routePrefixValidationError('zh')).toMatch(/reserved/i);
    expect(routePrefixValidationError('api')).toMatch(/reserved/i);
    expect(isReservedSpacePrefix('registered-reader')).toBe(true);
    expect(routePrefixValidationError('two/segments')).toMatch(/single/i);
    expect(routePrefixValidationError('not_valid')).toMatch(/lowercase/i);
    expect(routePrefixValidationError('g')).toBeNull();
  });

  it('creates canonical, prefix-first URLs without a root/default-space exception', () => {
    expect(canonicalSpacePath({ kind: 'wiki', routePrefix: 'w' }, 'guide/中文')).toBe('/w/guide/%E4%B8%AD%E6%96%87');
    expect(canonicalSpacePath({ kind: 'generated', routePrefix: 'g' }, 'concepts/payment', 'zh')).toBe('/g/zh/concepts/payment');
    expect(canonicalSpacePath({ kind: 'raw', routePrefix: 'r' })).toBe('/r');
  });
});
