import { Type } from 'typebox';
import type { AnyAgentTool, OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';
import type { BridgeConfig } from './config.js';
import { ApiClientError, WikiApiClient } from './api-client.js';

const MAX_QUERY_CHARS = 4_000;
const MAX_CONTENT_CHARS = 16_000;
const MAX_REASON_CHARS = 500;

function textResult(text: string, details: unknown): { content: Array<{ type: 'text'; text: string }>; details: unknown } {
  return { content: [{ type: 'text', text }], details };
}

function errorResult(code: string, message: string): { content: Array<{ type: 'text'; text: string }>; details: unknown } {
  return textResult(`Agent memory error (${code}): ${message}`, { ok: false, code });
}

/** Escapes text before it can appear in model-visible tool output, per the bridge contract's "escaped citations" requirement. */
function escapeForModel(value: string): string {
  return value.replace(/[<>&]/gu, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char);
}

function citationLine(record: { title: unknown; citation: { canonicalUrl: unknown; revisionId: unknown } }): string {
  const title = escapeForModel(String(record.title));
  const url = escapeForModel(String(record.citation.canonicalUrl));
  const revisionId = escapeForModel(String(record.citation.revisionId));
  return `- ${title} (${url}, revision ${revisionId})`;
}

async function handleClientError(operation: () => Promise<unknown>): Promise<{ content: Array<{ type: 'text'; text: string }>; details: unknown }> {
  try {
    const result = await operation();
    return result as { content: Array<{ type: 'text'; text: string }>; details: unknown };
  } catch (error) {
    if (error instanceof ApiClientError) return errorResult(error.code, error.message);
    return errorResult('unavailable', 'Agent memory is temporarily unavailable.');
  }
}

/**
 * Registers the four optional static tools from the bridge contract. All are
 * invisible until the operator enables `tools.enabled`; save/forget remain
 * subject to full server-side authorization regardless of tool visibility,
 * and to whatever tool-call confirmation the host applies (this package adds
 * no additional approval mechanism of its own — none is documented in the
 * installed SDK beyond the host's own tool-call flow).
 */
export function registerAgentMemoryTools(api: OpenClawPluginApi, config: BridgeConfig, client: WikiApiClient): void {
  if (!config.tools.enabled) return;

  const searchTool: AnyAgentTool = {
    name: 'agent_memory_search',
    label: 'Search Agent Memory',
    description: 'Search this key\'s bound Agent memory destination.',
    parameters: Type.Object({
      query: Type.String({ maxLength: MAX_QUERY_CHARS }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
    }),
    async execute(_id, params) {
      return handleClientError(async () => {
        const { query, limit } = params as { query: string; limit?: number };
        const response = await client.recall(query, limit ?? 5);
        const results = Array.isArray(response.results) ? response.results : [];
        if (results.length === 0) return textResult('No matching Agent memory records.', { ok: true, count: 0 });
        const lines = (results as Array<Parameters<typeof citationLine>[0]>).map(citationLine);
        return textResult(`Found ${results.length} Agent memory record(s):\n${lines.join('\n')}`, { ok: true, count: results.length });
      });
    },
  };

  const saveTool: AnyAgentTool = {
    name: 'agent_memory_save',
    label: 'Save to Agent Memory',
    description: 'Explicitly save approved content to this key\'s bound Agent memory destination.',
    parameters: Type.Object({
      content: Type.String({ minLength: 1, maxLength: MAX_CONTENT_CHARS }),
      title: Type.Optional(Type.String({ maxLength: 160 })),
    }),
    async execute(_id, params) {
      return handleClientError(async () => {
        const { content, title } = params as { content: string; title?: string };
        const response = await client.save({
          idempotencyKey: crypto.randomUUID(),
          content,
          ...(title ? { title } : {}),
        });
        const record = response.record as { memoryId?: string } | undefined;
        return textResult('Saved to Agent memory.', { ok: true, memoryId: record?.memoryId });
      });
    },
  };

  const forgetTool: AnyAgentTool = {
    name: 'agent_memory_forget',
    label: 'Forget Agent Memory record',
    description: 'Reversibly forget one record from this key\'s bound Agent memory destination.',
    parameters: Type.Object({
      memoryId: Type.String({ format: 'uuid' }),
      reason: Type.Optional(Type.String({ maxLength: MAX_REASON_CHARS })),
    }),
    async execute(_id, params) {
      return handleClientError(async () => {
        const { memoryId, reason } = params as { memoryId: string; reason?: string };
        await client.forget(memoryId, reason);
        return textResult('Forgot the requested Agent memory record.', { ok: true });
      });
    },
  };

  const statusTool: AnyAgentTool = {
    name: 'agent_memory_status',
    label: 'Agent Memory status',
    description: 'Report this key\'s Agent memory diagnostics (no credentials or content).',
    parameters: Type.Object({}),
    async execute() {
      return handleClientError(async () => {
        const diagnostics = await client.diagnostics();
        return textResult(`Agent memory status: ${String(diagnostics.status ?? 'unknown')}.`, diagnostics);
      });
    },
  };

  api.registerTool(searchTool, { optional: true });
  api.registerTool(saveTool, { optional: true });
  api.registerTool(forgetTool, { optional: true });
  api.registerTool(statusTool, { optional: true });
}
