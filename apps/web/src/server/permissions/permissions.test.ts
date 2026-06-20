import { describe, it, expect } from 'vitest';
import { buildAnonymousCtx, buildUserCtx, buildApiKeyCtx, can } from '@/server/permissions';

describe('permissions', () => {
  it('anonymous can read when anonymousRead is true', () => {
    expect(can(buildAnonymousCtx(), 'read', { kind: 'page_list' }, { anonymousRead: true })).toBe(true);
  });

  it('anonymous cannot read when anonymousRead is false', () => {
    expect(can(buildAnonymousCtx(), 'read', { kind: 'page_list' }, { anonymousRead: false })).toBe(false);
  });

  it('reader can read published pages', () => {
    expect(can(buildUserCtx('u1', 'reader'), 'read', { kind: 'page_list' })).toBe(true);
  });

  it('reader cannot create or edit', () => {
    expect(can(buildUserCtx('u1', 'reader'), 'create', { kind: 'page_list' })).toBe(false);
    expect(can(buildUserCtx('u1', 'reader'), 'edit', { kind: 'page', pageId: 'p1' })).toBe(false);
  });

  it('editor can create and edit', () => {
    expect(can(buildUserCtx('u1', 'editor'), 'create', { kind: 'page_list' })).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'edit', { kind: 'page', pageId: 'p1' })).toBe(true);
  });

  it('only author or admin can read draft', () => {
    expect(can(buildUserCtx('u1', 'editor'), 'read_draft', { kind: 'revision', pageId: 'p1', version: 1 }, { isAuthor: false })).toBe(false);
    expect(can(buildUserCtx('u1', 'editor'), 'read_draft', { kind: 'revision', pageId: 'p1', version: 1 }, { isAuthor: true })).toBe(true);
    expect(can(buildUserCtx('u1', 'admin'), 'read_draft', { kind: 'revision', pageId: 'p1', version: 1 }, { isAuthor: false })).toBe(true);
  });

  it('only admin can manage users', () => {
    expect(can(buildUserCtx('u1', 'admin'), 'manage_users', { kind: 'users' })).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'manage_users', { kind: 'users' })).toBe(false);
    expect(can(buildUserCtx('u1', 'reader'), 'manage_users', { kind: 'users' })).toBe(false);
  });

  it('api_key with view scope can read but not create', () => {
    const ctx = buildApiKeyCtx('u1', 'reader', ['view'], 'k1');
    expect(can(ctx, 'read', { kind: 'page_list' })).toBe(true);
    expect(can(ctx, 'create', { kind: 'page_list' })).toBe(false);
  });

  it('api_key with create scope owned by reader is denied create (scope ∩ role)', () => {
    const ctx = buildApiKeyCtx('u1', 'reader', ['create'], 'k1');
    expect(can(ctx, 'create', { kind: 'page_list' })).toBe(false);
  });

  it('api_key with edit scope owned by editor can edit', () => {
    const ctx = buildApiKeyCtx('u1', 'editor', ['edit'], 'k1');
    expect(can(ctx, 'edit', { kind: 'page', pageId: 'p1' })).toBe(true);
  });

  it('manage_users is always denied for api_key', () => {
    const ctx = buildApiKeyCtx('u1', 'admin', ['view', 'create', 'edit', 'delete', 'share', 'run'], 'k1');
    expect(can(ctx, 'manage_users', { kind: 'users' })).toBe(false);
  });

  it('manage_storage is admin-only and requires the storage scope for api keys', () => {
    expect(can(buildUserCtx('u1', 'admin'), 'manage_storage', { kind: 'storage' })).toBe(true);
    expect(can(buildUserCtx('u1', 'editor'), 'manage_storage', { kind: 'storage' })).toBe(false);
    expect(can(buildAnonymousCtx(), 'manage_storage', { kind: 'storage' })).toBe(false);

    // scope ∩ role: admin key with the storage scope passes; without it, denied;
    // a non-admin key with the scope is denied by role.
    expect(can(buildApiKeyCtx('u1', 'admin', ['storage'], 'k1'), 'manage_storage', { kind: 'storage' })).toBe(true);
    expect(can(buildApiKeyCtx('u1', 'admin', ['view'], 'k1'), 'manage_storage', { kind: 'storage' })).toBe(false);
    expect(can(buildApiKeyCtx('u1', 'editor', ['storage'], 'k1'), 'manage_storage', { kind: 'storage' })).toBe(false);
  });

  it('manage_preferences is allowed for any signed-in actor (self) and needs the scope for keys', () => {
    expect(can(buildUserCtx('u1', 'reader'), 'manage_preferences', { kind: 'preferences' })).toBe(true);
    expect(can(buildUserCtx('u1', 'admin'), 'manage_preferences', { kind: 'preferences' })).toBe(true);
    expect(can(buildAnonymousCtx(), 'manage_preferences', { kind: 'preferences' })).toBe(false);

    expect(can(buildApiKeyCtx('u1', 'reader', ['preferences'], 'k1'), 'manage_preferences', { kind: 'preferences' })).toBe(true);
    expect(can(buildApiKeyCtx('u1', 'reader', ['view'], 'k1'), 'manage_preferences', { kind: 'preferences' })).toBe(false);
  });
});
