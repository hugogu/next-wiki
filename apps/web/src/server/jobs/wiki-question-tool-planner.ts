import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import type { ToolPlanStep } from '@/server/services/ai-tool-runtime';

export type ToolPlannerState = {
  question: string;
  conversation: { question: string; answer: string }[];
  wikiSources: QuestionSource[];
  transcript: string[];
};

export type ToolPlannerParseResult = ToolPlanStep | { kind: 'invalid_tool_calls' };

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
        'No baseline Wiki sources were retrieved. For informational answers, use read/search tools before answering; if the Wiki still does not support an answer, reply with INSUFFICIENT_WIKI_EVIDENCE.',
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
      const parsed = JSON.parse(match[1]!.trim()) as {
        tool_calls?: Array<{ tool?: unknown; arguments?: unknown; review?: unknown }>;
      };
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
  return { kind: 'final', text: output.trim() };
}
