import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';
import {
  getSpaceById,
  getSpaceByKind,
  getSpaceBySlug,
  invalidateSpaceCache,
  listSpaces,
  resolveSpace,
} from './spaces';

describe('spaces service', () => {
  beforeAll(async () => {
    await resetSetupOnboardingState();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('resolveSpace defaults to the default space', async () => {
    const space = await resolveSpace();
    expect(space?.slug).toBe('default');
    expect(space?.kind).toBe('wiki');
  });

  it('resolveSpace maps the reader-facing "wiki" alias to the default space', async () => {
    // The nav/edit/new routes address the default space as `wiki` (ReaderSpace),
    // but it is persisted with slug `default`. Without this alias every
    // `/edit?space=wiki` and `/new?space=wiki` load 404s.
    const space = await resolveSpace('wiki');
    expect(space?.slug).toBe('default');
    expect(space?.kind).toBe('wiki');
  });

  it('resolveSpace resolves an explicit slug and returns null for unknown slugs', async () => {
    await db
      .insert(schema.spaces)
      .values({ slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false })
      .onConflictDoNothing();
    const raw = await resolveSpace('raw');
    expect(raw?.slug).toBe('raw');
    expect(raw?.kind).toBe('raw');
    await expect(resolveSpace('missing')).resolves.toBeNull();
  });

  it('getSpaceBySlug and getSpaceById find the same row', async () => {
    const bySlug = await getSpaceBySlug('default');
    expect(bySlug).not.toBeNull();
    const byId = await getSpaceById(bySlug!.id);
    expect(byId?.slug).toBe('default');
    await expect(getSpaceBySlug('missing')).resolves.toBeNull();
  });

  it('getSpaceByKind and listSpaces reflect the current rows', async () => {
    await db
      .insert(schema.spaces)
      .values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false })
      .onConflictDoNothing();
    const wiki = await getSpaceByKind('wiki');
    expect(wiki.map((space) => space.slug)).toContain('default');
    const generated = await getSpaceByKind('generated');
    expect(generated.map((space) => space.slug)).toEqual(['generated']);
    const all = await listSpaces();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('invalidateSpaceCache is safe and reads stay fresh', async () => {
    expect(() => invalidateSpaceCache()).not.toThrow();
    await db
      .insert(schema.spaces)
      .values({ slug: 'fresh', name: 'Fresh', kind: 'wiki' })
      .onConflictDoNothing();
    const space = await getSpaceBySlug('fresh');
    expect(space?.slug).toBe('fresh');
  });
});
