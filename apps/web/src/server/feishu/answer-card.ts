export type FeishuAnswerCitation = {
  title: string;
  url: string;
};

function markdownLink({ title, url }: FeishuAnswerCitation): string {
  const label = title.replace(/[\\[\]]/g, '\\$&');
  return `- [${label}](${url})`;
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
