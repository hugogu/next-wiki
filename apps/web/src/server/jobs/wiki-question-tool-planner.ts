import type { AiToolReviewDecision } from '@next-wiki/shared';
import { parse as parseYaml } from 'yaml';

import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import { buildWikiAssistantSystemPrompt } from '@/server/ai/prompts/wiki-question';
import type { ToolPlanStep } from '@/server/services/ai-tool-runtime';
import type { ToolDefinition } from '@/server/services/ai-tool-registry';

export type ToolPlannerState = {
  question: string;
  conversation: { question: string; answer: string }[];
  wikiSources: QuestionSource[];
  transcript: string[];
};

export type ToolPlannerParseResult = ToolPlanStep | { kind: 'invalid_tool_calls' };

/** Marker in the tool system prompt where the runtime injects the live,
 * policy-filtered tool catalog. Kept out of admin storage so enabling/disabling
 * a tool never requires editing the prompt. */
export const TOOL_CATALOG_PLACEHOLDER = '{{TOOLS}}';

/**
 * Built-in default for the admin-editable tool system prompt (AI > Prompts).
 * The `{{TOOLS}}` placeholder is replaced at runtime with the current enabled
 * tool catalog; the fenced tool-call protocol MUST be preserved for tool
 * calling to work (the Prompts UI offers a reset to this default).
 */
export const DEFAULT_TOOL_SYSTEM_PROMPT = [
  'You can inspect and prepare governed changes to this Wiki with the tools listed below. Tool availability and permissions are enforced by the server.',
  'Treat tool results as authoritative for whether an operation succeeded. Never claim a Wiki operation succeeded before receiving a successful tool result.',
  'When the user explicitly asks you to create, edit, organize, or otherwise operate on the Wiki, perform the appropriate tool calls instead of merely explaining what could be done.',
  'Durable knowledge changes must remain permission-scoped, audited, reviewable, and reversible; follow the review disposition and outcome returned by the server.',
  'Available tools:',
  TOOL_CATALOG_PLACEHOLDER,
  '',
  'To use tools, reply with ONLY a fenced code block and nothing else. YAML is preferred because Markdown content can use a block scalar:',
  '```tool',
  'tool_calls:',
  '  - tool: search_wiki',
  '    arguments:',
  '      query: "..."',
  '    review: none',
  '```',
  'Set "review" to "admin_review" for changes that should be reviewed. After receiving tool results, either call more tools in the same format or write the final answer as plain prose.',
  'Baseline Wiki sources are provided in the user prompt. Tool-read pages are cited through the tool runtime.',
  'Do not repeat semantically equivalent searches. After a few reasonable attempts, answer with the best available knowledge instead of searching again.',
  'If the user asks to save, write, or turn previous conversation content into a Wiki page, use create_page or save_draft instead of only answering conversationally.',
  'For create_page, use path, title, and contentSource. To save the latest assistant answer, use contentFromConversation=true instead of repeating the answer in contentSource.',
  'After create_page succeeds, always include a Markdown link to the new page in the final answer, using the exact title and href returned by the tool result. Do not replace this page link with a citation marker.',
  'For save_draft, use the exact pageId returned by get_page, then pass complete replacement Markdown in contentSource. The title is optional and retains the page title by default. Use contentFromConversation=true only when saving the prior assistant answer unchanged.',
  'Never guess a page path for get_page. Use baseline sources, search_wiki, or list_pages first, then pass an exact returned path or pageId.',
].join('\n');

export type WikiToolPromptOverrides = {
  assistantSystemPrompt?: string | null;
  toolSystemPrompt?: string | null;
};

/**
 * Compose the tool-enabled system prompt. Admin-configured `assistantSystemPrompt`
 * and `toolSystemPrompt` (from AI > Prompts) override the built-in defaults; the
 * live tool catalog is always injected at `{{TOOLS}}` (appended if the admin
 * removed the marker) so tool availability stays machine-controlled.
 */
export function buildWikiToolSystemPrompt(
  tools: ToolDefinition[],
  overrides: WikiToolPromptOverrides = {},
): string {
  const toolList = tools.map((tool) => `- ${tool.name} (${tool.category}): ${tool.description}`).join('\n');
  const template = overrides.toolSystemPrompt?.trim() ? overrides.toolSystemPrompt : DEFAULT_TOOL_SYSTEM_PROMPT;
  const toolSection = template.includes(TOOL_CATALOG_PLACEHOLDER)
    ? template.replaceAll(TOOL_CATALOG_PLACEHOLDER, toolList)
    : `${template}\n\nAvailable tools:\n${toolList}`;
  return buildWikiAssistantSystemPrompt([toolSection], overrides.assistantSystemPrompt);
}

export function extractTaggedThinking(output: string): string {
  return [...output.matchAll(/<think>([\s\S]*?)<\/think>/gi)]
    .map((match) => match[1]?.trim())
    .filter((text): text is string => Boolean(text))
    .join('\n\n');
}

export function buildPlannerUserPrompt(state: ToolPlannerState): string {
  const sources = state.wikiSources.length > 0
    ? [
        '<wiki_sources>',
        ...state.wikiSources.map(
          (source) =>
            `<source id="${source.id}" title="${source.title}" path="${source.path}">\n${source.content}\n</source>`,
        ),
        '</wiki_sources>',
        '',
      ]
    : [
        '<wiki_sources>',
        'No baseline Wiki sources were retrieved. For informational answers, make a few useful read/search attempts when the Wiki is likely to help. If it still lacks relevant evidence, answer normally from general model knowledge without Wiki citations.',
        '</wiki_sources>',
        '',
      ];
  const conversation = state.conversation.length > 0
    ? [
        '<conversation>',
        ...state.conversation.map(
          (turn) => `<turn><question>${turn.question}</question><answer>${turn.answer}</answer></turn>`,
        ),
        '</conversation>',
        '',
      ]
    : [];
  if (state.transcript.length === 0) {
    return [...sources, ...conversation, '<question>', state.question, '</question>'].join('\n');
  }
  return [
    ...sources,
    ...conversation,
    '<question>',
    state.question,
    '</question>',
    '',
    'Tool results so far:',
    ...state.transcript,
    '',
    'Continue.',
  ].join('\n');
}

/** Parse one planner turn: a valid tool-call block requests tools; malformed
 * protocol output is explicitly retried by the caller; plain prose is final. */
export function parseToolPlan(output: string): ToolPlannerParseResult {
  const match = output.match(/```(?:tool|json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      const source = match[1]!.trim();
      let parsed: {
        tool_calls?: Array<{ tool?: unknown; arguments?: unknown; review?: unknown }>;
      };
      try {
        parsed = JSON.parse(source) as typeof parsed;
      } catch {
        // YAML block scalars let models emit long Markdown contentSource
        // values without fragile JSON newline escaping.
        parsed = parseYaml(source) as typeof parsed;
      }
      const rawCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
      const calls = rawCalls
        .filter((call) => typeof call.tool === 'string')
        .map((call) => ({
          toolName: String(call.tool),
          arguments: (call.arguments && typeof call.arguments === 'object' ? call.arguments : {}) as Record<string, unknown>,
          requestedReview: (call.review === 'admin_review' ? 'admin_review' : 'none') as AiToolReviewDecision,
        }));
      if (calls.length > 0) return { kind: 'tool_calls', calls };
    } catch {
      // A malformed/truncated tool block is not a final answer. The caller
      // retries the planner with explicit protocol feedback.
      return { kind: 'invalid_tool_calls' };
    }
    return { kind: 'invalid_tool_calls' };
  }
  // An opening fence with no matching close means the model's tool-call block
  // was truncated by the output token budget before it could finish. Treat it
  // as invalid (retryable) instead of silently accepting the truncated text as
  // a final answer.
  if (/```(?:tool|json)?\s*\n/.test(output)) {
    return { kind: 'invalid_tool_calls' };
  }
  return { kind: 'final', text: output.trim() };
}
