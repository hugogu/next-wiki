import { describe, it, expect } from 'vitest';
import { isPathReserved, isAddressReserved, addressReservation, describeAddressReservation } from './reserved-paths';
import { RESERVED_ROUTE_COUNT } from './manifest';

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
    expect(isAddressReserved('new')).toBe(true);
    expect(isAddressReserved('admin/users')).toBe(true);
    expect(isAddressReserved('getting-started')).toBe(false);
  });

  it('reserves a two-letter leading segment as a translation locale', () => {
    expect(isAddressReserved('zh')).toBe(true);
    expect(isAddressReserved('zh/tutorial')).toBe(true);
    expect(isAddressReserved('en/getting-started')).toBe(true);
    // Three or more letters are not a locale collision — 'ai' below is
    // deliberately exactly two letters and IS correctly caught by this rule.
    expect(isAddressReserved('faq')).toBe(false);
    expect(isAddressReserved('models/ai')).toBe(false);
    expect(isAddressReserved('ai/models')).toBe(true);
  });

  it('reserves static-site prefixes and root files', () => {
    expect(isAddressReserved('_static/bundle')).toBe(true);
    expect(isAddressReserved('_assets/logo.png')).toBe(true);
    expect(isAddressReserved('pagefind/index')).toBe(true);
    expect(isAddressReserved('sitemap.xml')).toBe(true);
    expect(isAddressReserved('404.html')).toBe(true);
  });

  it('does not flag an ordinary tree path validated by isPathReserved-only rules', () => {
    // Only the address-specific check adds locale/static-site rules; a tree
    // path with a leading two-letter folder name is untouched by that check.
    expect(isPathReserved('zh')).toBe(false);
    expect(isPathReserved('_static')).toBe(false);
  });

  it('does not flag a legitimate multi-level address', () => {
    expect(isAddressReserved('guides/deployment/kubernetes')).toBe(false);
  });

  it('names the violated rule via addressReservation/describeAddressReservation', () => {
    expect(describeAddressReservation(addressReservation('admin/users')!)).toMatch(/built-in/i);
    expect(describeAddressReservation(addressReservation('zh')!)).toMatch(/translation/i);
    expect(describeAddressReservation(addressReservation('_static/x')!)).toMatch(/static site/i);
    expect(addressReservation('faq')).toBeNull();
  });
});
