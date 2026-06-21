import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fetchRemote } from './remote-fetch';

const inventoryPageSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  locale: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  isPublished: z.boolean(),
  isPrivate: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
const sourcePageSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  content: z.string(),
  contentType: z.string().nullable().optional(),
  editor: z.string().nullable().optional(),
  locale: z.string(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  tags: z.array(z.union([z.string(), z.object({ tag: z.string(), title: z.string().optional() })])).optional(),
  authorName: z.string().nullable().optional(),
  creatorName: z.string().nullable().optional(),
});

const INVENTORY_QUERY = `query NextWikiPageInventory {
  pages { list(orderBy: ID, orderByDirection: ASC) {
    id path locale title description contentType isPublished isPrivate createdAt updatedAt tags
  } }
}`;
const SOURCE_QUERY = `query NextWikiPageSource($id: Int!) {
  pages { single(id: $id) {
    id path title description content contentType editor locale createdAt updatedAt
    tags { tag title } authorName creatorName
  } }
}`;

export class WikiJsClient {
  constructor(
    readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly allowPrivateNetwork: boolean,
  ) {}

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const origin = new URL(this.baseUrl).origin;
    const response = await fetchRemote({
      url: `${this.baseUrl.replace(/\/$/, '')}/graphql`,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({ query, variables }),
      maxBytes: 20 * 1024 * 1024,
      allowedPrivateOrigin: this.allowPrivateNetwork ? origin : undefined,
    });
    let body: { data?: T; errors?: { message?: string }[] };
    try {
      body = JSON.parse(response.bytes.toString('utf8'));
    } catch {
      throw new Error('Wiki.js returned invalid JSON');
    }
    if (body.errors?.length || !body.data) {
      throw new Error(body.errors?.[0]?.message ?? 'Wiki.js response is missing data');
    }
    return body.data;
  }

  async listPages() {
    const data = await this.query<{ pages: { list: unknown[] } }>(INVENTORY_QUERY);
    return z.array(inventoryPageSchema).parse(data.pages.list).filter((page) => page.isPublished);
  }

  async getPage(id: number) {
    const data = await this.query<{ pages: { single: unknown } }>(SOURCE_QUERY, { id });
    const page = sourcePageSchema.parse(data.pages.single);
    if (page.id !== id) throw new Error('Wiki.js returned an inconsistent page id');
    return {
      ...page,
      fingerprint: createHash('sha256').update(JSON.stringify(page)).digest('hex'),
    };
  }
}
