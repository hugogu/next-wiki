import { describe, expect, it } from 'vitest';
import { buildPlannerUserPrompt, parseToolPlan } from '@/server/jobs/ai-tool-chat-planner';

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

describe('buildPlannerUserPrompt', () => {
  it('includes recent conversation so follow-up write requests can use the prior answer', () => {
    const prompt = buildPlannerUserPrompt({
      question: 'Write the above into a standalone wiki page.',
      conversation: [
        {
          question: 'Summarize the tool runtime.',
          answer: 'It lets Wiki AI create governed draft pages through tools.',
        },
      ],
      wikiSources: [],
      transcript: [],
    });

    expect(prompt).toContain('<conversation>');
    expect(prompt).toContain('It lets Wiki AI create governed draft pages through tools.');
    expect(prompt).toContain('<question>');
    expect(prompt).toContain('Write the above into a standalone wiki page.');
  });

  it('includes baseline Wiki sources for grounded informational answers', () => {
    const prompt = buildPlannerUserPrompt({
      question: '介绍张飞',
      conversation: [],
      wikiSources: [
        {
          id: 'S1',
          pageId: '00000000-0000-4000-8000-000000000001',
          revisionId: '00000000-0000-4000-9000-000000000001',
          title: '张飞',
          path: 'history/china/zhang-fei',
          locale: 'zh',
          revisionHash: 'hash',
          content: '张飞，字益德，是三国时期蜀汉将领。',
        },
      ],
      transcript: [],
    });

    expect(prompt).toContain('<wiki_sources>');
    expect(prompt).toContain('<source id="S1" title="张飞" path="history/china/zhang-fei">');
    expect(prompt).toContain('张飞，字益德');
  });
});
