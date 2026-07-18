import type { PermCtx } from '@/server/permissions';

export async function createEntry(
  _ctx: PermCtx,
  _input: { path: string; title: string; inputKind: string; source?: unknown; content: string },
): Promise<{ pageId: string; versionId: string }> {
  throw new Error('not implemented');
}

export async function appendEntry(
  _ctx: PermCtx,
  _pageId: string,
  _input: { content: string; source?: unknown },
): Promise<{ versionId: string; versionNumber: number }> {
  throw new Error('not implemented');
}
