import type { PermCtx } from '@/server/permissions';

export async function createLinkPage(
  _ctx: PermCtx,
  _input: { path: string; title?: string; targetPageId: string },
): Promise<{ pageId: string; versionId: string }> {
  throw new Error('not implemented');
}

export async function retargetLinkPage(
  _ctx: PermCtx,
  _pageId: string,
  _targetPageId: string,
): Promise<{ versionId: string }> {
  throw new Error('not implemented');
}

export async function deleteLinkPage(_ctx: PermCtx, _pageId: string): Promise<void> {
  throw new Error('not implemented');
}

export async function listLiveLinksForTarget(_targetPageId: string): Promise<string[]> {
  throw new Error('not implemented');
}
