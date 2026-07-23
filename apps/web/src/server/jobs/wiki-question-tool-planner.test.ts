import { describe, expect, it } from 'vitest';
import {
  buildPlannerUserPrompt,
  buildWikiToolSystemPrompt,
  extractTaggedThinking,
  parseToolPlan,
} from '@/server/jobs/wiki-question-tool-planner';
import { getToolDefinition } from '@/server/services/ai-tool-registry';

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

  it('marks a malformed tool block for retry instead of exposing it as a final answer', () => {
    const step = parseToolPlan('```tool\n{not valid json}\n```');
    expect(step.kind).toBe('invalid_tool_calls');
  });

  it('treats an empty tool_calls list as a final answer', () => {
    const step = parseToolPlan('```tool\n{"tool_calls":[]}\n```');
    expect(step.kind).toBe('invalid_tool_calls');
  });

  it('detects a create_page block truncated before the tool_calls array closes', () => {
    const output = '```tool\n{"tool_calls":[{"tool":"create_page","arguments":{"path":"history/china/figures/zhang-fei","title":"张飞","content":"# 张飞"},"review":"admin_review"}}\n```';
    expect(parseToolPlan(output)).toEqual({ kind: 'invalid_tool_calls' });
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
    expect(prompt).toContain('answer normally from general model knowledge');
    expect(prompt).not.toContain('INSUFFICIENT_WIKI_EVIDENCE');
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

describe('buildWikiToolSystemPrompt', () => {
  it('extends the shared Wiki AI identity and environment rules with the tool protocol', () => {
    const searchTool = getToolDefinition('search_wiki');
    const createTool = getToolDefinition('create_page');
    const prompt = buildWikiToolSystemPrompt([searchTool!, createTool!]);

    expect(prompt).toContain('conversational knowledge agent embedded in this Next Wiki instance');
    expect(prompt).toContain('current Wiki is your working knowledge environment');
    expect(prompt).toContain('answer helpfully from general model knowledge');
    expect(prompt).toContain('Markdown math syntax');
    expect(prompt).toContain('perform the appropriate tool calls instead of merely explaining');
    expect(prompt).toContain('- create_page (page_draft)');
    expect(prompt).toContain('contentFromConversation=true');
  });
});

describe('extractTaggedThinking', () => {
  it('retains tagged reasoning that precedes a tool-call block', () => {
    expect(extractTaggedThinking('<think>Inspect the Wiki first.</think>\n```tool\n{}\n```'))
      .toBe('Inspect the Wiki first.');
  });
});
