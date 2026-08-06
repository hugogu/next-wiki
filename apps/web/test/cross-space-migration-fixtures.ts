import { randomUUID } from 'node:crypto';

export const crossSpaceFixtureIds = {
  sourceSpaceId: '11111111-1111-4111-8111-111111111111',
  destinationSpaceId: '22222222-2222-4222-8222-222222222222',
  pageId: '33333333-3333-4333-8333-333333333333',
};

export function migrationFixture(overrides: Partial<{ id: string; status: string }> = {}) {
  return { id: overrides.id ?? randomUUID(), status: overrides.status ?? 'queued' };
}

export function pageSelection(pageId = crossSpaceFixtureIds.pageId) {
  return { kind: 'page' as const, pageId };
}

export function folderSelection(pathPrefix = 'imports') {
  return { kind: 'folder' as const, sourceSpaceId: crossSpaceFixtureIds.sourceSpaceId, pathPrefix };
}
