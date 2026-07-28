import { randomUUID } from 'node:crypto';

export const IMAGE_TOOL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2jZsAAAAASUVORK5CYII=',
  'base64',
);

export function imageToolIds() {
  return {
    pageId: randomUUID(),
    revisionId: randomUUID(),
    spaceId: randomUUID(),
  };
}
