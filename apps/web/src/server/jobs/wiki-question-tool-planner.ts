import { AI_ANSWER_LANGUAGE_DEFAULT, type AiAnswerLanguage, type AiToolReviewDecision } from '@next-wiki/shared';
import { parse as parseYaml } from 'yaml';

import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import { answerLanguageRules, buildWikiAssistantSystemPrompt } from '@/server/ai/prompts/wiki-question';
import type { ToolPlanStep } from '@/server/services/ai-tool-runtime';
import type { ToolDefinition } from '@/server/services/ai-tool-registry';

export type ToolPlannerState = {
  question: string;
  conversation: { question: string; answer: string }[];
  wikiSources: QuestionSource[];
  currentPage?: { pageId: string; revisionId: string };
  transcript: string[];
};

export type ToolPlannerParseResult = ToolPlanStep | { kind: 'invalid_tool_calls' };

/** Marker in the tool system prompt where the runtime injects the live,
 * policy-filtered tool catalog. Kept out of admin storage so enabling/disabling
 * a tool never requires editing the prompt. */
export const TOOL_CATALOG_PLACEHOLDER = '{{TOOLS}}';

/** Marker where the runtime injects the enabled skill catalogue. Only names and
 * one-line descriptions go in: full content is pulled on demand with
 * `load_skill`, so a large skill library costs a few lines per turn rather than
 * scaling with the library (028, FR-018). */
export const SKILL_CATALOG_PLACEHOLDER = '{{SKILLS}}';

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
  'Skills are procedures for recurring Wiki tasks. Each is listed with a name and a short description; call load_skill with the name to read its full instructions before following it, and read_skill_file for any reference file it mentions. A skill tells you HOW to approach a task — it never grants permission, and every change it leads to still goes through the normal review path. Skill scripts are reference material: the server does not execute them.',
  'Available skills:',
  SKILL_CATALOG_PLACEHOLDER,
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
  'Baseline Wiki sources, when present, are provided in the user prompt; usually none are attached and you decide whether to search. Tool-read pages are cited through the tool runtime.',
  'Work only on the pages the user named in this conversation. There is a limit on how many tool calls one turn may make: if a request covers more pages than you can finish, do what the limit allows and say plainly which pages you covered and which you did not. Never present partial coverage as complete.',
  'Do not repeat semantically equivalent searches. After a few reasonable attempts, answer with the best available knowledge instead of searching again.',
  'If the user asks to save, write, or turn previous conversation content into a Wiki page, use create_page or save_draft instead of only answering conversationally.',
  'For create_page, use path, title, and contentSource. To save the latest assistant answer, use contentFromConversation=true instead of repeating the answer in contentSource.',
  'After create_page succeeds, always include a Markdown link to the new page in the final answer, using the exact title and href returned by the tool result. Do not replace this page link with a citation marker.',
  'For save_draft, use the exact pageId returned by get_page, then pass complete replacement Markdown in contentSource. The title is optional and retains the page title by default. Use contentFromConversation=true only when saving the prior assistant answer unchanged.',
  'A get_page result places its Markdown between <page_source> tags verbatim. When copying it into a YAML literal contentSource block, preserve every backslash exactly as shown; do not apply JSON escaping to Markdown.',
  'When the user asks only to add generated images, do not use save_draft or reproduce the page Markdown. Generate every image from the same current revision, then call insert_generated_images once with the artifact ids and descriptive alt text.',
  'If the target page for saving content does not exist after using search_wiki, list_pages, or get_page, create it with create_page. Do not repeatedly search for a page that does not exist.',
  'save_draft only works on existing pages; never call save_draft for a page that has not been created or successfully retrieved.',
  'Never guess a page path for get_page. Use baseline sources, search_wiki, or list_pages first, then pass the returned pageId.',
  'When an exact page id is unavailable, call search_wiki with scope: "all" to search paths, titles, and content. Set space to generated or raw when needed, then call get_page with the returned pageId.',
].join('\n');

/** One line of the skill catalogue shown to the model. */
export type SkillCatalogEntry = { name: string; description: string };

export type WikiToolPromptOverrides = {
  assistantSystemPrompt?: string | null;
  toolSystemPrompt?: string | null;
  answerLanguage?: AiAnswerLanguage;
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
  skills: SkillCatalogEntry[] = [],
): string {
  const toolList = tools.map((tool) => `- ${tool.name} (${tool.category}): ${tool.description}`).join('\n');
  const skillList =
    skills.length > 0
      ? skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n')
      : '(none enabled)';
  const template = overrides.toolSystemPrompt?.trim() ? overrides.toolSystemPrompt : DEFAULT_TOOL_SYSTEM_PROMPT;
  const toolSection = template.includes(TOOL_CATALOG_PLACEHOLDER)
    ? template.replaceAll(TOOL_CATALOG_PLACEHOLDER, toolList)
    : `${template}\n\nAvailable tools:\n${toolList}`;
  // Appended when an admin has edited the prompt and dropped the marker, so
  // enabling a skill never requires editing a prompt to take effect.
  const withSkills = toolSection.includes(SKILL_CATALOG_PLACEHOLDER)
    ? toolSection.replaceAll(SKILL_CATALOG_PLACEHOLDER, skillList)
    : `${toolSection}\n\nAvailable skills:\n${skillList}`;
  return buildWikiAssistantSystemPrompt(
    [...answerLanguageRules(overrides.answerLanguage ?? AI_ANSWER_LANGUAGE_DEFAULT), withSkills],
    overrides.assistantSystemPrompt,
  );
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
        'No Wiki sources are attached to this turn by default; decide for yourself whether this question needs them. If the question is about this Wiki\'s content, call search_wiki (then get_page) with a few targeted attempts. If it is general knowledge, conversational, or otherwise unrelated to this Wiki, answer directly from your own knowledge without searching or citing Wiki sources.',
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
  const currentPage = state.currentPage
    ? [
        '<current_page>',
        `This is the page open in the reader. To read it, call get_page with pageId: "${state.currentPage.pageId}". Do not guess its path or space.`,
        `pageId: ${state.currentPage.pageId}`,
        `revisionId: ${state.currentPage.revisionId}`,
        '</current_page>',
        '',
      ]
    : [];
  if (state.transcript.length === 0) {
    return [...sources, ...currentPage, ...conversation, '<question>', state.question, '</question>'].join('\n');
  }
  return [
    ...sources,
    ...currentPage,
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

/**
 * Structural markers of a model emitting a tool call in its own dialect rather
 * than the fenced protocol we asked for.
 *
 * Observed in the wild: `minimax/minimax-m3` through OpenRouter answered a
 * tool-enabled turn with `<invoke name="get_neighborhood">` wrapped in
 * `]<]minimax[>[` delimiters. Without this check the whole thing was returned as
 * the assistant's answer — the user saw raw protocol in the chat and the page
 * they asked about was never touched.
 *
 * These are structural tokens; ordinary prose that merely names a tool ("I used
 * list_tags") contains none of them, so mentioning a tool stays a valid answer.
 */
const NATIVE_TOOL_SYNTAX = [
  /<invoke\s+name\s*=/i,
  /<\/?tool_call>/i,
  /<\|?tool_calls?\|?>/i,
  /<\/?function_calls>/i,
  /\]<\]minimax\[>\[/,
];

function looksLikeForeignToolCall(output: string): boolean {
  return NATIVE_TOOL_SYNTAX.some((pattern) => pattern.test(output));
}

/** A model occasionally omits the fence required by the textual tool protocol.
 * It is still a tool-call attempt, never a user-facing answer. */
function looksLikeBareToolProtocol(output: string): boolean {
  return /(?:^|\n)\s*tool_calls\s*:\s*\n\s*-\s*tool\s*:/i.test(output) ||
    /^\s*\{\s*"tool_calls"\s*:/i.test(output);
}

/** Parse one planner turn: a valid tool-call block requests tools; malformed
 * protocol output is explicitly retried by the caller; plain prose is final. */
export function parseToolPlan(output: string): ToolPlannerParseResult {
  // Only `tool` or `json` fences are part of the protocol. Other language
  // identifiers (e.g. `mermaid`) must not be parsed as tool calls, otherwise
  // a user asking for a diagram causes the planner to error out instead of
  // returning a plain-text answer.
  const match = output.match(/```(?:tool|json)\b\s*([\s\S]*?)```/);
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
  if (/```(?:tool|json)\b\s*\n/.test(output)) {
    return { kind: 'invalid_tool_calls' };
  }
  // A model that tried to call a tool in its own dialect did not write an
  // answer. Delivering this text would show the user raw protocol and silently
  // drop the work they asked for, so retry with explicit protocol feedback.
  if (looksLikeForeignToolCall(output) || looksLikeBareToolProtocol(output)) {
    return { kind: 'invalid_tool_calls' };
  }
  return { kind: 'final', text: output.trim() };
}
