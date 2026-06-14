import { describe, it, expect } from 'vitest';
import { buildAnonymousCtx, buildUserCtx, can } from '@/server/permissions';

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
});
