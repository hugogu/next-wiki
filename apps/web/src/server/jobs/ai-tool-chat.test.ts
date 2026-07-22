import { describe, expect, it } from 'vitest';
import { parseToolPlan } from '@/server/jobs/ai-tool-chat';

describe('parseToolPlan — provider-agnostic tool protocol', () => {
  it('parses a tool-call block into an iterative tool_calls step', () => {
    const output = '```tool\n{"tool_calls":[{"tool":"search_wiki","arguments":{"query":"payment"},"review":"none"}]}\n```';
    const step = parseToolPlan(output);
    expect(step.kind).toBe('tool_calls');
    if (step.kind === 'tool_calls') {
      expect(step.calls[0]).toMatchObject({ toolName: 'search_wiki', requestedReview: 'none' });
      expect(step.calls[0]?.arguments).toEqual({ query: 'payment' });
    }
  });

  it('carries an admin_review request through from the model', () => {
    const output = '```tool\n{"tool_calls":[{"tool":"rename_tag","arguments":{"tagId":"t","name":"n"},"review":"admin_review"}]}\n```';
    const step = parseToolPlan(output);
    expect(step.kind).toBe('tool_calls');
    if (step.kind === 'tool_calls') expect(step.calls[0]?.requestedReview).toBe('admin_review');
  });

  it('supports multiple tool calls in one iteration', () => {
    const output = '```tool\n{"tool_calls":[{"tool":"search_wiki","arguments":{}},{"tool":"list_pages","arguments":{}}]}\n```';
    const step = parseToolPlan(output);
    expect(step.kind).toBe('tool_calls');
    if (step.kind === 'tool_calls') expect(step.calls).toHaveLength(2);
  });

  it('treats plain prose as a final answer', () => {
    const step = parseToolPlan('The deployment config lives in docker-compose.yml.');
    expect(step).toEqual({ kind: 'final', text: 'The deployment config lives in docker-compose.yml.' });
  });

  it('degrades a malformed tool block to a final answer instead of looping', () => {
    const step = parseToolPlan('```tool\n{not valid json}\n```');
    expect(step.kind).toBe('final');
  });

  it('treats an empty tool_calls list as a final answer', () => {
    const step = parseToolPlan('```tool\n{"tool_calls":[]}\n```');
    expect(step.kind).toBe('final');
  });
});
