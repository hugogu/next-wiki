import type { WikiMemoryClient } from './api-client';

type ToolApi = {
  registerTool?: (name: string, handler: (input: Record<string, unknown>) => Promise<unknown>, options?: Record<string, unknown>) => void;
  requestPermission?: (request: { tool: string; allowedDecisions: Array<'allow-once' | 'deny'>; title: string }) => Promise<{ decision?: string }>;
};

export function registerTools(api: ToolApi, client: WikiMemoryClient, approve?: (name: string) => Promise<boolean>): void {
  if (!api.registerTool) return;
  api.registerTool('next_wiki_memory_search', async (input) => {
    const query = typeof input.query === 'string' ? input.query : '';
    const limit = typeof input.limit === 'number' ? Math.min(10, Math.max(1, input.limit)) : 3;
    return client.recall(query, 'granted', limit);
  }, { optional: true });
  api.registerTool('next_wiki_memory_save', async (input) => {
    if (!approve || !(await approve('next_wiki_memory_save'))) throw new Error('tool_denied');
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : crypto.randomUUID();
    const content = typeof input.content === 'string' ? input.content : '';
    return client.save({ idempotencyKey, content, title: typeof input.title === 'string' ? input.title : undefined });
  }, { optional: true });
  api.registerTool('next_wiki_memory_forget', async (input) => {
    if (!approve || !(await approve('next_wiki_memory_forget'))) throw new Error('tool_denied');
    if (typeof input.memoryId !== 'string') throw new Error('memory_id_required');
    return client.forget(input.memoryId);
  }, { optional: true });
  api.registerTool('next_wiki_memory_status', async () => client.status(), { optional: true });
}
