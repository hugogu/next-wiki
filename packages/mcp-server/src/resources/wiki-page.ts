import { z } from 'zod';
import type { PublicPageResource, WikiApiClient } from '../api-client';

export const resourceUriRegex = /^wiki:\/\/pages\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function listWikiResources(client: WikiApiClient) {
  const pages: PublicPageResource[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.listPages({ status: 'published', limit: 100, order: 'path', cursor });
    pages.push(...response.items);
    cursor = response.nextCursor ?? undefined;
  } while (cursor);

  return pages.map((page) => ({
    uri: `wiki://pages/${page.id}`,
    name: page.title,
    mimeType: 'text/markdown' as const,
    description: `${page.title} (${page.path})`,
  }));
}

export async function readWikiResource(client: WikiApiClient, uri: string) {
  const match = resourceUriRegex.exec(uri);
  if (!match) {
    throw new Error(`Invalid wiki resource URI: ${uri}`);
  }

  const pageId = match[1]!;
  const page = await client.getPage(pageId);

  return {
    uri,
    mimeType: 'text/markdown' as const,
    text: page.contentSource ?? '',
  };
}

export const wikiPageUriSchema = z.string().regex(resourceUriRegex, 'Invalid wiki page resource URI');
