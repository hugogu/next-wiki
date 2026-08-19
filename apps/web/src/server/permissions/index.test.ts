import { describe, it, expect, afterEach } from 'vitest';
import { buildAnonymousCtx, buildUserCtx, buildApiKeyCtx, can, setDemoReadOnlyCache } from '@/server/permissions';

const pageList = { kind: 'page_list' } as const;
const page = { kind: 'page', pageId: 'p1' } as const;
const revision = { kind: 'revision', pageId: 'p1', version: 1 } as const;

describe('permissions space-kind matrix (022)', () => {
  describe('raw space', () => {
    it('allows public reads but keeps restricted reads admin-only', () => {
      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'raw', visibility: 'public', anonymousRead: false })).toBe(true);
      expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, { spaceKind: 'raw', visibility: 'public' })).toBe(true);
      expect(can(buildUserCtx('u1', 'editor'), 'read', pageList, { spaceKind: 'raw', visibility: 'public' })).toBe(true);
      expect(can(buildUserCtx('u1', 'admin'), 'read', pageList, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'raw', visibility: 'restricted' })).toBe(false);
    });

    it('create is admin-only', () => {
      expect(can(buildUserCtx('u1', 'editor'), 'create', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildUserCtx('u1', 'admin'), 'create', pageList, { spaceKind: 'raw' })).toBe(true);
    });

    it('edit, delete, publish, read_draft are denied for every actor', () => {
      const admin = buildUserCtx('u1', 'admin');
      expect(can(admin, 'edit', page, { spaceKind: 'raw' })).toBe(false);
      expect(can(admin, 'delete', page, { spaceKind: 'raw' })).toBe(false);
      expect(can(admin, 'publish', revision, { spaceKind: 'raw' })).toBe(false);
      expect(can(admin, 'read_draft', revision, { spaceKind: 'raw' })).toBe(false);
      const adminKey = buildApiKeyCtx('u1', 'admin', ['view', 'create', 'edit', 'delete'], 'k1');
      expect(can(adminKey, 'edit', page, { spaceKind: 'raw' })).toBe(false);
      expect(can(adminKey, 'delete', page, { spaceKind: 'raw' })).toBe(false);
      expect(can(adminKey, 'publish', revision, { spaceKind: 'raw' })).toBe(false);
      expect(can(adminKey, 'read_draft', revision, { spaceKind: 'raw' })).toBe(false);
    });

    it('api_key still needs the matching scope (scope ∩ role)', () => {
      // 046: reads additionally need the key's own spaceAccess grant — pass it
      // explicitly here so this test isolates scope ∩ role as originally intended.
      expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1', ['wiki', 'raw']), 'read', pageList, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'admin', ['create'], 'k1', ['wiki', 'raw']), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      // Writes are governed by roleAllows alone — no spaceAccess grant needed.
      expect(can(buildApiKeyCtx('u1', 'admin', ['create'], 'k1'), 'create', pageList, { spaceKind: 'raw' })).toBe(true);
      // An editor-role key defaults to wiki-only spaceAccess — unlike a
      // session/UI editor, it can no longer read even public raw content
      // without an explicit grant (spaceAccess is stricter than roleAllows).
      expect(can(buildApiKeyCtx('u1', 'editor', ['view'], 'k1'), 'read', pageList, { spaceKind: 'raw', visibility: 'public' })).toBe(false);
      expect(can(buildApiKeyCtx('u1', 'editor', ['create'], 'k1'), 'create', pageList, { spaceKind: 'raw' })).toBe(false);
    });

    it('non-page actions fall through to role evaluation', () => {
      expect(can(buildUserCtx('u1', 'admin'), 'manage_users', { kind: 'users' }, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildUserCtx('u1', 'editor'), 'manage_users', { kind: 'users' }, { spaceKind: 'raw' })).toBe(false);
    });
  });

  describe('generated space', () => {
    it('allows public reads but keeps authoring and restricted reads admin-only', () => {
      const editor = buildUserCtx('u1', 'editor');
      expect(can(editor, 'read', pageList, { spaceKind: 'generated', visibility: 'public' })).toBe(true);
      expect(can(editor, 'read_draft', revision, { spaceKind: 'generated' })).toBe(false);
      expect(can(editor, 'create', pageList, { spaceKind: 'generated' })).toBe(false);
      expect(can(editor, 'edit', page, { spaceKind: 'generated' })).toBe(false);
      expect(can(editor, 'publish', revision, { spaceKind: 'generated' })).toBe(false);
      expect(can(editor, 'delete', page, { spaceKind: 'generated' })).toBe(false);

      const admin = buildUserCtx('u1', 'admin');
      expect(can(admin, 'read', pageList, { spaceKind: 'generated' })).toBe(true);
      expect(can(admin, 'read_draft', revision, { spaceKind: 'generated' })).toBe(true);
      expect(can(admin, 'create', pageList, { spaceKind: 'generated' })).toBe(true);
      expect(can(admin, 'edit', page, { spaceKind: 'generated' })).toBe(true);
      expect(can(admin, 'publish', revision, { spaceKind: 'generated' })).toBe(true);
      expect(can(admin, 'delete', page, { spaceKind: 'generated' })).toBe(true);

      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'generated', visibility: 'public', anonymousRead: false })).toBe(true);
      expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, { spaceKind: 'generated', visibility: 'public' })).toBe(true);
      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'generated', visibility: 'restricted' })).toBe(false);
    });

    it('api_key still needs the matching scope (scope ∩ role)', () => {
      // 046: reads additionally need the key's own spaceAccess grant — pass it
      // explicitly here so this test isolates scope ∩ role as originally intended.
      expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1', ['wiki', 'generated']), 'read', pageList, { spaceKind: 'generated' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'admin', ['delete'], 'k1', ['wiki', 'generated']), 'read', pageList, { spaceKind: 'generated' })).toBe(false);
      // Writes are governed by roleAllows alone — no spaceAccess grant needed.
      expect(can(buildApiKeyCtx('u1', 'admin', ['delete'], 'k1'), 'delete', page, { spaceKind: 'generated' })).toBe(true);
      // An editor-role key defaults to wiki-only spaceAccess — unlike a
      // session/UI editor, it can no longer read even public generated
      // content without an explicit grant (spaceAccess is stricter than
      // roleAllows).
      expect(can(buildApiKeyCtx('u1', 'editor', ['view'], 'k1'), 'read', pageList, { spaceKind: 'generated', visibility: 'public' })).toBe(false);
    });
  });

  describe('wiki space / undefined spaceKind', () => {
    it('behavior is unchanged', () => {
      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'wiki', anonymousRead: true })).toBe(true);
      expect(can(buildAnonymousCtx(), 'read', pageList, { anonymousRead: true })).toBe(true);
      expect(can(buildUserCtx('u1', 'editor'), 'create', pageList, { spaceKind: 'wiki' })).toBe(true);
      expect(can(buildUserCtx('u1', 'editor'), 'edit', page, { spaceKind: 'wiki' })).toBe(true);
      expect(can(buildUserCtx('u1', 'reader'), 'create', pageList, { spaceKind: 'wiki' })).toBe(false);
    });
  });
});

describe('permissions visibility matrix (022)', () => {
  it('registered pages are readable by any signed-in user but not anonymously', () => {
    const opts = { visibility: 'registered' } as const;
    expect(can(buildAnonymousCtx(), 'read', pageList, opts)).toBe(false);
    expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, opts)).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'read', pageList, opts)).toBe(true);
    expect(can(buildUserCtx('u1', 'admin'), 'read', pageList, opts)).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'edit', page, opts)).toBe(true);
    expect(can(buildUserCtx('u1', 'reader'), 'read_draft', revision, opts)).toBe(false);
  });

  it('restricted read/read_draft/edit are admin-only', () => {
    const opts = { visibility: 'restricted' } as const;
    expect(can(buildAnonymousCtx(), 'read', pageList, opts)).toBe(false);
    expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, opts)).toBe(false);
    expect(can(buildUserCtx('u1', 'editor'), 'read', pageList, opts)).toBe(false);
    expect(can(buildUserCtx('u1', 'admin'), 'read', pageList, opts)).toBe(true);

    expect(can(buildUserCtx('u1', 'editor'), 'read_draft', revision, { ...opts, isAuthor: true })).toBe(false);
    expect(can(buildUserCtx('u1', 'admin'), 'read_draft', revision, opts)).toBe(true);

    expect(can(buildUserCtx('u1', 'editor'), 'edit', page, opts)).toBe(false);
    expect(can(buildUserCtx('u1', 'admin'), 'edit', page, opts)).toBe(true);
  });

  it('restricted does not affect create/publish/delete', () => {
    const opts = { visibility: 'restricted' } as const;
    expect(can(buildUserCtx('u1', 'editor'), 'create', pageList, opts)).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'publish', revision, { ...opts, isAuthor: true })).toBe(true);
    expect(can(buildUserCtx('u1', 'admin'), 'delete', page, opts)).toBe(true);
  });

  it('api_key with admin role still needs the matching scope', () => {
    expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1'), 'read', pageList, { visibility: 'restricted' })).toBe(true);
    expect(can(buildApiKeyCtx('u1', 'admin', ['edit'], 'k1'), 'read', pageList, { visibility: 'restricted' })).toBe(false);
    expect(can(buildApiKeyCtx('u1', 'editor', ['view'], 'k1'), 'read', pageList, { visibility: 'restricted' })).toBe(false);
  });

  it('public visibility is unchanged', () => {
    expect(can(buildAnonymousCtx(), 'read', pageList, { visibility: 'public', anonymousRead: true })).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'edit', page, { visibility: 'public' })).toBe(true);
  });
});

describe('demo-readonly mode (DB-backed via setDemoReadOnlyCache)', () => {
  afterEach(() => {
    setDemoReadOnlyCache(false);
  });

  it('blocks writes for every actor, including admins, once enabled', () => {
    setDemoReadOnlyCache(true);
    const admin = buildUserCtx('u1', 'admin');
    expect(can(admin, 'edit', page)).toBe(false);
    expect(can(admin, 'create', pageList)).toBe(false);
    expect(can(admin, 'publish', revision)).toBe(false);
    expect(can(admin, 'delete', page)).toBe(false);
    expect(can(admin, 'attach_file', page)).toBe(false);
    expect(can(admin, 'manage_users', { kind: 'users' })).toBe(false);
    expect(can(buildApiKeyCtx('u1', 'admin', ['edit'], 'k1'), 'edit', page)).toBe(false);
  });

  it('leaves reads and AI Q&A/search untouched', () => {
    setDemoReadOnlyCache(true);
    const reader = buildUserCtx('u1', 'reader');
    expect(can(reader, 'read', pageList)).toBe(true);
    expect(can(reader, 'use_ai_search', { kind: 'ai_action', actionId: 'a1' })).toBe(true);
    expect(can(reader, 'use_ai_qa', { kind: 'ai_action', actionId: 'a1' })).toBe(true);
  });

  it('still lets an admin turn the mode back off — the toggle itself is never blocked', () => {
    setDemoReadOnlyCache(true);
    const admin = buildUserCtx('u1', 'admin');
    expect(can(admin, 'manage_demo_mode', { kind: 'demo_mode' })).toBe(true);
    // But a non-admin still can't, and an API key never can (no scope maps to it).
    expect(can(buildUserCtx('u1', 'editor'), 'manage_demo_mode', { kind: 'demo_mode' })).toBe(false);
    expect(can(buildApiKeyCtx('u1', 'admin', ['edit'], 'k1'), 'manage_demo_mode', { kind: 'demo_mode' })).toBe(false);
  });

  it('is a no-op when disabled', () => {
    const admin = buildUserCtx('u1', 'admin');
    expect(can(admin, 'edit', page)).toBe(true);
  });
});
