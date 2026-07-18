import { describe, it, expect } from 'vitest';
import { buildAnonymousCtx, buildUserCtx, buildApiKeyCtx, can } from '@/server/permissions';

const pageList = { kind: 'page_list' } as const;
const page = { kind: 'page', pageId: 'p1' } as const;
const revision = { kind: 'revision', pageId: 'p1', version: 1 } as const;

describe('permissions space-kind matrix (022)', () => {
  describe('raw space', () => {
    it('read is admin-only', () => {
      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildUserCtx('u1', 'editor'), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildUserCtx('u1', 'admin'), 'read', pageList, { spaceKind: 'raw' })).toBe(true);
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
      expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1'), 'read', pageList, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'admin', ['create'], 'k1'), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildApiKeyCtx('u1', 'admin', ['create'], 'k1'), 'create', pageList, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'editor', ['view'], 'k1'), 'read', pageList, { spaceKind: 'raw' })).toBe(false);
      expect(can(buildApiKeyCtx('u1', 'editor', ['create'], 'k1'), 'create', pageList, { spaceKind: 'raw' })).toBe(false);
    });

    it('non-page actions fall through to role evaluation', () => {
      expect(can(buildUserCtx('u1', 'admin'), 'manage_users', { kind: 'users' }, { spaceKind: 'raw' })).toBe(true);
      expect(can(buildUserCtx('u1', 'editor'), 'manage_users', { kind: 'users' }, { spaceKind: 'raw' })).toBe(false);
    });
  });

  describe('generated space', () => {
    it('read, read_draft, create, edit, publish, delete are admin-only', () => {
      const editor = buildUserCtx('u1', 'editor');
      expect(can(editor, 'read', pageList, { spaceKind: 'generated' })).toBe(false);
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

      expect(can(buildAnonymousCtx(), 'read', pageList, { spaceKind: 'generated' })).toBe(false);
      expect(can(buildUserCtx('u1', 'reader'), 'read', pageList, { spaceKind: 'generated' })).toBe(false);
    });

    it('api_key still needs the matching scope (scope ∩ role)', () => {
      expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1'), 'read', pageList, { spaceKind: 'generated' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'admin', ['delete'], 'k1'), 'read', pageList, { spaceKind: 'generated' })).toBe(false);
      expect(can(buildApiKeyCtx('u1', 'admin', ['delete'], 'k1'), 'delete', page, { spaceKind: 'generated' })).toBe(true);
      expect(can(buildApiKeyCtx('u1', 'editor', ['view'], 'k1'), 'read', pageList, { spaceKind: 'generated' })).toBe(false);
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
