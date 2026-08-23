import { describe, it, expect } from 'vitest';
import { isPathReserved, isAddressReserved, addressReservation, describeAddressReservation } from './reserved-paths';
import { RESERVED_ROUTE_COUNT } from './manifest';

const TEST_LOCALES = new Set(['zh', 'en', 'fr']);

describe('reserved-paths / manifest discovery', () => {
  it('finds at least the obvious static routes', () => {
    // These all live in apps/web/app/ and must be discovered at module load.
    expect(isPathReserved('new')).toBe(true);
    expect(isPathReserved('search')).toBe(true);
    expect(isPathReserved('pages')).toBe(true);
    expect(isPathReserved('tags')).toBe(false); // only tags/[name] exists, not /tags itself
    expect(isPathReserved('tags/any-tag')).toBe(true);
    expect(isPathReserved('edit')).toBe(false); // edit/[...path] is editor, not /edit itself
    expect(isPathReserved('edit/foo')).toBe(true); // ...but edit/foo IS shadowed
    expect(isPathReserved('admin')).toBe(false); // no static /admin page.tsx, only /admin/users etc.
    expect(isPathReserved('admin/users')).toBe(true);
    expect(isPathReserved('admin/storage')).toBe(true);
    expect(isPathReserved('api')).toBe(false); // no static /api route.ts, only /api/v1/...
    expect(isPathReserved('api/v1/pages')).toBe(true);
    expect(isPathReserved('api/v1/pages/abc-123/drafts')).toBe(true);
    expect(isPathReserved('auth')).toBe(false); // no static /auth route.ts, only /auth/login etc.
    expect(isPathReserved('auth/login')).toBe(true);
    expect(isPathReserved('forbidden')).toBe(true);
    expect(isPathReserved('healthz')).toBe(true);
    expect(isPathReserved('h/anything')).toBe(true);
    expect(isPathReserved('readyz')).toBe(true);
    expect(isPathReserved('setup')).toBe(true);
    expect(isPathReserved('s/space-id')).toBe(true);
    expect(isPathReserved('user-center')).toBe(true);
    expect(isPathReserved('user-center/profile')).toBe(true);
  });

  it('does not flag normal wiki paths as reserved', () => {
    expect(isPathReserved('getting-started')).toBe(false);
    expect(isPathReserved('docs/intro')).toBe(false);
    expect(isPathReserved('projects/2026/roadmap')).toBe(false);
    expect(isPathReserved('history/china/liu-bei')).toBe(false);
    expect(isPathReserved('foo/bar/baz')).toBe(false);
  });

  it('does not flag the wiki catch-all itself as reserved', () => {
    // The catch-all is excluded from the reserved set; without the wiki
    // catch-all exclusion, EVERY path would conflict with itself.
    expect(RESERVED_ROUTE_COUNT).toBeGreaterThan(0);
  });

  it('rejects dynamic segments in the app directory that would conflict', () => {
    // /api/v1/pages/[id]/tags exists in the app — so /api/v1/pages/foo/tags
    // should also be reserved.
    expect(isPathReserved('api/v1/pages/anything/tags')).toBe(true);
    // /api/v1/tags/[id]/merge — same rule.
    expect(isPathReserved('api/v1/tags/anything/merge')).toBe(true);
  });
});

describe('isAddressReserved (035: public addresses — slugs and aliases)', () => {
  it('reserves everything isPathReserved already reserves', () => {
    expect(isAddressReserved('new', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('admin/users', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('getting-started', TEST_LOCALES)).toBe(false);
  });

  it('reserves configured translation-language codes as locale prefixes', () => {
    expect(isAddressReserved('zh', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('zh/tutorial', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('en/getting-started', TEST_LOCALES)).toBe(true);
    // Non-configured two-letter segments are available for page addresses.
    expect(isAddressReserved('ai/models', TEST_LOCALES)).toBe(false);
    expect(isAddressReserved('ai/agents/dsh/advantage', TEST_LOCALES)).toBe(false);
  });

  it('does not reserve three-or-more-letter leading segments', () => {
    expect(isAddressReserved('faq', TEST_LOCALES)).toBe(false);
    expect(isAddressReserved('models/ai', TEST_LOCALES)).toBe(false);
    expect(isAddressReserved('guides/deployment/kubernetes', TEST_LOCALES)).toBe(false);
  });

  it('reserves static-site prefixes and root files', () => {
    expect(isAddressReserved('_static/bundle', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('_assets/logo.png', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('pagefind/index', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('sitemap.xml', TEST_LOCALES)).toBe(true);
    expect(isAddressReserved('404.html', TEST_LOCALES)).toBe(true);
  });

  it('does not flag an ordinary tree path validated by isPathReserved-only rules', () => {
    // Only the address-specific check adds locale/static-site rules; a tree
    // path with a leading two-letter folder name is untouched by that check.
    expect(isPathReserved('zh')).toBe(false);
    expect(isPathReserved('_static')).toBe(false);
  });

  it('names the violated rule via addressReservation/describeAddressReservation', () => {
    expect(describeAddressReservation(addressReservation('admin/users', TEST_LOCALES)!)).toMatch(/built-in/i);
    expect(describeAddressReservation(addressReservation('zh', TEST_LOCALES)!)).toMatch(/translation/i);
    expect(describeAddressReservation(addressReservation('_static/x', TEST_LOCALES)!)).toMatch(/static site/i);
    expect(addressReservation('faq', TEST_LOCALES)).toBeNull();
  });
});
