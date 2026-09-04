import type { NextWikiClient } from './client.js';
import type { SyncService } from './sync-service.js';
import { Type } from 'typebox';

export type ToolRuntime = { client: NextWikiClient; sync: SyncService };
export type ToolRuntimeResolver = () => Promise<ToolRuntime>;

function output(details: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(details) }], details };
}

export function createTools(client: NextWikiClient, sync: SyncService): ReturnType<typeof createToolsFromResolver>;
export function createTools(runtime: ToolRuntimeResolver, getStatus?: () => Promise<unknown>): ReturnType<typeof createToolsFromResolver>;
export function createTools(clientOrResolver: NextWikiClient | ToolRuntimeResolver, syncOrGetStatus?: SyncService | (() => Promise<unknown>)) {
  const resolveRuntime: ToolRuntimeResolver = typeof clientOrResolver === 'function'
    ? clientOrResolver
    : async () => ({ client: clientOrResolver, sync: syncOrGetStatus as SyncService });
  const getStatus = typeof syncOrGetStatus === 'function' ? syncOrGetStatus : async () => (await resolveRuntime()).sync.getStatus();
  return createToolsFromResolver(resolveRuntime, getStatus);
}

function createToolsFromResolver(resolveRuntime: ToolRuntimeResolver, getStatus: () => Promise<unknown>) {
  return {
    next_wiki_status: { name: 'next_wiki_status', label: 'next-wiki status', description: 'Show sync health without content or secrets.', parameters: Type.Object({}, { additionalProperties: false }), execute: async () => output(await getStatus()) },
    next_wiki_sync: { name: 'next_wiki_sync', label: 'sync next-wiki', description: 'Run an explicitly requested Memory Wiki mirror scan.', parameters: Type.Object({}, { additionalProperties: false }), execute: async () => output(await (await resolveRuntime()).sync.run()) },
    next_wiki_search: { name: 'next_wiki_search', label: 'search next-wiki', description: 'Search currently readable next-wiki Wiki, Raw, and Generated knowledge.', parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 4000 }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) }, { additionalProperties: false }), execute: async (_id: string, input: { query: string; limit?: number }) => { const { client } = await resolveRuntime(); return output(await client.search(input.query, input.limit ?? 8)); } },
    next_wiki_get: { name: 'next_wiki_get', label: 'read next-wiki page', description: 'Read one selected next-wiki search result and return its citation.', parameters: Type.Object({ pageId: Type.String({ minLength: 1 }), maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 20_000 })) }, { additionalProperties: false }), execute: async (_id: string, input: { pageId: string; maxChars?: number }) => { const { client } = await resolveRuntime(); return output(await client.get(input.pageId, input.maxChars ?? 8_000)); } },
  };
}
