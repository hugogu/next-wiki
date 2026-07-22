import type { AiToolReviewDecision } from '@next-wiki/shared';

export type ToolPlannerState = {
  question: string;
  conversation: { question: string; answer: string }[];
  transcript: string[];
};

export type ToolPlannerStep =
  | {
      kind: 'tool_calls';
      calls: Array<{
        toolName: string;
        arguments: Record<string, unknown>;
        requestedReview: AiToolReviewDecision;
      }>;
    }
  | { kind: 'final'; text: string };

export function buildPlannerUserPrompt(state: ToolPlannerState): string {
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
    return [...conversation, '<question>', state.question, '</question>'].join('\n');
  }
  return [
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

/** Parse one planner turn: a tool-call block requests tools; anything else is a
 * final answer. Malformed tool blocks degrade to a final answer rather than
 * looping. */
export function parseToolPlan(output: string): ToolPlannerStep {
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
      // Not a valid tool block — treat as a final answer below.
    }
  }
  return { kind: 'final', text: output.trim() };
}
