import type { NeutralToolCall, NeutralToolDefinition, NeutralToolResult } from '@next-wiki/shared';
import {
  AiProviderError,
  normalizeProviderError,
  streamTextWithRetry,
  type AiProviderAdapter,
  type TextGenerationMessage,
} from '@/server/ai/types';
import { DomainError } from '@/server/errors';
import type { ToolDefinition } from '@/server/services/ai-tool-registry';
import type { ToolPlanStep, ToolPlanner, ToolTurnState } from '@/server/services/ai-tool-runtime';
import {
  buildPlannerUserPrompt,
  extractTaggedThinking,
  parseToolPlan,
} from '@/server/jobs/wiki-question-tool-planner';

/**
 * The two ways a model can be asked for its next tool step (028, US1).
 *
 * Both return the same `ToolPlanStep`, which is the whole point: `runToolLoop`,
 * policy resolution, review, audit, Raw evidence, and the chat timeline sit
 * downstream and never learn which one ran. That is what makes "switching
 * vendors changes nothing about tools, permissions, or review" a structural
 * property rather than a promise (FR-004, FR-007).
 */

// How many times to re-ask when the model returns a malformed tool block. A
// malformed native call is instead downgraded to this protocol by the question
// job, so the user can still finish the current request.
const MAX_TOOL_PROTOCOL_RETRIES = 3;

const RETRY_INSTRUCTION =
  '\n\nYour previous tool-call block was invalid or truncated. Re-emit the complete tool call as valid YAML or JSON using the exact documented argument names. Prefer a YAML block scalar (`contentSource: |`) for multiline Markdown.';

const EMPTY_PLANNER_RESPONSE_RETRY_INSTRUCTION =
  '\n\nYour previous response contained only hidden reasoning and no tool call or final answer. Continue the turn now: emit one complete fenced tool call using the exact documented argument names, or write the final answer as plain prose. Do not stop after reasoning.';

export type PlannerDeps = {
  adapter: AiProviderAdapter;
  actionId: string;
  modelExternalId: string;
  system: string;
  temperature?: number;
  abortSignal: AbortSignal;
  /** Per-iteration output budget, computed from the prompt and model window. */
  maxOutputTokens: (system: string, prompt: string) => number | undefined;
  onReasoning: (text: string) => Promise<void>;
  onUsage: (event: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  }) => void;
};

/**
 * The original fenced-YAML protocol, moved out of the question job unchanged.
 * Works with any text model, including ones with no function-calling at all,
 * which is why it stays the floor rather than a legacy path.
 */
export function createTextProtocolPlanner(deps: PlannerDeps): ToolPlanner {
  return async (state: ToolTurnState): Promise<ToolPlanStep> => {
    const basePrompt = buildPlannerUserPrompt(state);
    let previousOutput = '';
    for (let attempt = 0; attempt < MAX_TOOL_PROTOCOL_RETRIES; attempt += 1) {
      const retryInstruction = attempt > 0
        ? (isEmptyPlannerOutput(previousOutput) ? EMPTY_PLANNER_RESPONSE_RETRY_INSTRUCTION : RETRY_INSTRUCTION)
        : '';
      const prompt = `${basePrompt}${retryInstruction}`;
      const output = await streamPlainText(deps, [{ role: 'user', content: prompt }], prompt);
      previousOutput = output;
      const parsed = parseToolPlan(output);
      if (parsed.kind === 'tool_calls') {
        const taggedThinking = extractTaggedThinking(output);
        if (taggedThinking) await deps.onReasoning(taggedThinking);
      }
      if (parsed.kind !== 'invalid_tool_calls') return parsed;
    }
    throw new DomainError('INVALID_RESPONSE', 'The AI provider repeatedly returned an invalid tool call.');
  };
}

function isEmptyPlannerOutput(output: string): boolean {
  return output.trim() === '' || /^\s*<think>[\s\S]*<\/think>\s*$/i.test(output);
}

/**
 * Native function-calling. The model receives the same policy-filtered catalogue
 * the text planner describes in prose, and its calls arrive as structured
 * events instead of a fenced block.
 */
export function createNativeToolPlanner(
  deps: PlannerDeps & { tools: (state: ToolTurnState) => ToolDefinition[] },
): ToolPlanner {
  return async (state: ToolTurnState): Promise<ToolPlanStep> => {
    const prompt = buildPlannerUserPrompt(state);
    const definitions = deps.tools(state).map(toNeutralDefinition);
    let text = '';
    const calls: NeutralToolCall[] = [];
    try {
      for await (const event of streamTextWithRetry(
        () =>
          deps.adapter.streamText({
            actionId: deps.actionId,
            modelExternalId: deps.modelExternalId,
            system: deps.system,
            messages: [{ role: 'user', content: prompt }],
            tools: definitions,
            maxOutputTokens: deps.maxOutputTokens(deps.system, prompt),
            temperature: deps.temperature,
            timeoutMs: null,
            abortSignal: deps.abortSignal,
          }),
        { signal: deps.abortSignal },
      )) {
        if (event.type === 'delta') text += event.text;
        else if (event.type === 'reasoning_delta') await deps.onReasoning(event.text);
        else if (event.type === 'tool_call') calls.push(event.call);
        else if (event.type === 'usage') deps.onUsage(event);
      }
    } catch (error) {
      throw toPlannerError(error);
    }
    if (calls.length > 0) {
      return {
        kind: 'tool_calls',
        calls: calls.map((call) => ({
          toolName: call.name,
          arguments: call.arguments,
          // Native tool calls carry no review field. The server decides, and
          // `resolveReview` is strictest-wins, so a model can only ever end up
          // with more review than it would have requested — never less.
          requestedReview: 'none' as const,
        })),
      };
    }
    // Some providers return a text-protocol tool call in `content` even when
    // native tools were requested. Reuse the protocol parser so that malformed
    // YAML/JSON is never rendered as a chat answer; a valid fenced call still
    // enters the same governed tool loop as a native call.
    const parsed = parseToolPlan(text);
    if (parsed.kind === 'invalid_tool_calls') {
      throw new DomainError('INVALID_RESPONSE', 'The AI provider returned an invalid tool call.');
    }
    return parsed;
  };
}

/** Map a registered tool onto the neutral definition offered to a model.
 * Input schemas come from the registry so both planners describe exactly the
 * same catalogue. */
function toNeutralDefinition(tool: ToolDefinition): NeutralToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {}, additionalProperties: true },
  };
}

/** Shared plain-text streaming used by the text protocol planner. */
async function streamPlainText(
  deps: PlannerDeps,
  messages: TextGenerationMessage[],
  prompt: string,
): Promise<string> {
  let output = '';
  try {
    for await (const event of streamTextWithRetry(
      () =>
        deps.adapter.streamText({
          actionId: deps.actionId,
          modelExternalId: deps.modelExternalId,
          system: deps.system,
          messages,
          maxOutputTokens: deps.maxOutputTokens(deps.system, prompt),
          temperature: deps.temperature,
          timeoutMs: null,
          abortSignal: deps.abortSignal,
        }),
      { signal: deps.abortSignal },
    )) {
      if (event.type === 'delta') output += event.text;
      else if (event.type === 'reasoning_delta') await deps.onReasoning(event.text);
      else if (event.type === 'usage') deps.onUsage(event);
    }
  } catch (error) {
    throw toPlannerError(error);
  }
  return output;
}

function toPlannerError(error: unknown): AiProviderError {
  const normalized = normalizeProviderError(error);
  if (normalized.code === 'TIMEOUT') {
    return new AiProviderError(
      'TIMEOUT',
      'The AI provider timed out while preparing the next Wiki action.',
      true,
    );
  }
  return normalized;
}

/** Convert executed tool results into the neutral envelope, for planners that
 * replay a multi-step turn to the provider. The text planner threads results
 * through its transcript instead, which is why this is exported separately. */
export function toNeutralResults(
  results: Array<{ callId: string; ok: boolean; content: string }>,
): NeutralToolResult[] {
  return results.map((result) => ({
    callId: result.callId,
    ok: result.ok,
    content: result.content,
    isError: !result.ok,
  }));
}
