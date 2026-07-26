import type { NeutralToolCall, NeutralToolDefinition } from '@next-wiki/shared';
import { AiProviderError, type TextGenerationMessage } from '../types';

/**
 * Translation between the provider-neutral tool envelope and the two wire
 * formats this project speaks (028, FR-001/FR-002).
 *
 * Everything vendor-shaped lives here so adapters stay thin and the runtime
 * never branches on provider. Argument fragments are accumulated to completion
 * before a call is surfaced: a half-parsed call must never reach the tool
 * runtime, because it would be indistinguishable from the model asking for
 * something it did not ask for.
 */

function parseArguments(raw: string, toolName: string): Record<string, unknown> {
  const trimmed = raw.trim();
  // Providers send `""` or `"{}"` for a no-argument call; both mean "no input".
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new AiProviderError(
      'INVALID_RESPONSE',
      `Provider returned unparseable arguments for tool ${toolName}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AiProviderError(
      'INVALID_RESPONSE',
      `Provider returned non-object arguments for tool ${toolName}`,
    );
  }
  return parsed as Record<string, unknown>;
}

// ---- OpenAI-compatible ------------------------------------------------------

export function toOpenAiTools(tools: NeutralToolDefinition[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
}

/**
 * Flatten neutral messages into the OpenAI message array. Tool results become
 * their own `role: "tool"` entries after the assistant turn that requested
 * them, which is the position the format requires for correlation by
 * `tool_call_id`.
 */
export function toOpenAiMessages(system: string, messages: TextGenerationMessage[]) {
  const out: Array<Record<string, unknown>> = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      });
      continue;
    }
    if (message.toolResults?.length) {
      // Any leading prose belongs to the user turn; the results follow as
      // their own messages so ids line up with the calls above.
      if (message.content) out.push({ role: message.role, content: message.content });
      for (const result of message.toolResults) {
        out.push({ role: 'tool', tool_call_id: result.callId, content: result.content });
      }
      continue;
    }
    out.push({ role: message.role, content: message.content });
  }
  return out;
}

export type OpenAiToolCallDelta = {
  index?: number;
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

/**
 * Accumulates OpenAI's indexed tool-call fragments. `id` and `name` arrive on
 * the first fragment for an index; `arguments` arrive as partial JSON that only
 * parses once concatenated.
 */
export class OpenAiToolCallAccumulator {
  private readonly byIndex = new Map<number, { id: string; name: string; args: string }>();

  push(deltas: OpenAiToolCallDelta[] | undefined): void {
    if (!Array.isArray(deltas)) return;
    for (const delta of deltas) {
      const index = typeof delta.index === 'number' ? delta.index : 0;
      const entry = this.byIndex.get(index) ?? { id: '', name: '', args: '' };
      if (typeof delta.id === 'string' && delta.id) entry.id = delta.id;
      if (typeof delta.function?.name === 'string' && delta.function.name) {
        entry.name = delta.function.name;
      }
      if (typeof delta.function?.arguments === 'string') entry.args += delta.function.arguments;
      this.byIndex.set(index, entry);
    }
  }

  /** Completed calls in the order the provider indexed them. Fragments without
   * a tool name are dropped: they carry no actionable request. */
  drain(): NeutralToolCall[] {
    const entries = [...this.byIndex.entries()].sort(([a], [b]) => a - b);
    this.byIndex.clear();
    return entries.flatMap(([index, entry]) => {
      if (!entry.name) return [];
      return [
        {
          id: entry.id || `call_${index}`,
          name: entry.name,
          arguments: parseArguments(entry.args, entry.name),
        },
      ];
    });
  }

  get size(): number {
    return this.byIndex.size;
  }
}

// ---- Anthropic --------------------------------------------------------------

export function toAnthropicTools(tools: NeutralToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/**
 * Build the Anthropic message array. Anthropic carries both directions as
 * content blocks: `tool_use` on the assistant turn, `tool_result` on the
 * following user turn.
 */
export function toAnthropicMessages(messages: TextGenerationMessage[]) {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      const blocks: Array<Record<string, unknown>> = [];
      if (message.content) blocks.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
      }
      return { role: 'assistant', content: blocks };
    }
    if (message.toolResults?.length) {
      const blocks: Array<Record<string, unknown>> = message.toolResults.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.callId,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      }));
      if (message.content) blocks.push({ type: 'text', text: message.content });
      return { role: 'user', content: blocks };
    }
    return { role: message.role, content: message.content };
  });
}

/**
 * Accumulates Anthropic `tool_use` content blocks. A block opens with
 * `content_block_start`, receives `input_json_delta` fragments, and completes at
 * `content_block_stop`.
 */
export class AnthropicToolBlockAccumulator {
  private readonly open = new Map<number, { id: string; name: string; json: string }>();

  start(index: number, block: { type?: unknown; id?: unknown; name?: unknown }): void {
    if (block?.type !== 'tool_use') return;
    this.open.set(index, {
      id: typeof block.id === 'string' ? block.id : `toolu_${index}`,
      name: typeof block.name === 'string' ? block.name : '',
      json: '',
    });
  }

  delta(index: number, partialJson: string): void {
    const entry = this.open.get(index);
    if (entry) entry.json += partialJson;
  }

  /** Returns the completed call for this index, or null when the block was not
   * a tool use (plain text blocks share the same index space). */
  stop(index: number): NeutralToolCall | null {
    const entry = this.open.get(index);
    if (!entry) return null;
    this.open.delete(index);
    if (!entry.name) return null;
    return { id: entry.id, name: entry.name, arguments: parseArguments(entry.json, entry.name) };
  }
}
