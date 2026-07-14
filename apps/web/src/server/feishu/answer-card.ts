export type FeishuAnswerCitation = {
  title: string;
  url: string;
};

export const FEISHU_STREAM_ANSWER_ELEMENT_ID = 'wiki_answer';

function markdownLink({ title, url }: FeishuAnswerCitation): string {
  const label = title.replace(/[\\[\]]/g, '\\$&');
  return `- [${label}](${url})`;
}

export function appendFeishuAnswerSources(
  answer: string,
  citations: FeishuAnswerCitation[],
): string {
  if (citations.length === 0) return answer;
  return `${answer}\n\n---\n**来源**\n${citations.map(markdownLink).join('\n')}`;
}

/** A CardKit JSON 2.0 card whose markdown element accepts native stream updates. */
export function buildFeishuStreamingAnswerCard(initialContent = '正在生成…'): Record<string, unknown> {
  return {
    schema: '2.0',
    config: {
      streaming_mode: true,
      summary: { content: 'Wiki 问答正在生成' },
      streaming_config: {
        print_frequency_ms: { default: 70 },
        print_step: { default: 1 },
        print_strategy: 'fast',
      },
    },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: 'Wiki 问答' },
    },
    body: {
      elements: [
        {
          tag: 'markdown',
          element_id: FEISHU_STREAM_ANSWER_ELEMENT_ID,
          content: initialContent,
        },
      ],
    },
  };
}

/** Build a compact, mobile-friendly card for a grounded Wiki answer. */
export function buildFeishuAnswerCard(
  answer: string,
  citations: FeishuAnswerCitation[],
): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [
    {
      tag: 'div',
      text: { tag: 'lark_md', content: answer },
    },
  ];
  if (citations.length > 0) {
    elements.push(
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**来源**\n${citations.map(markdownLink).join('\n')}`,
        },
      },
    );
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: 'Wiki 问答' },
    },
    elements,
  };
}
