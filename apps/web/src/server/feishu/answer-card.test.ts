import { describe, expect, it } from 'vitest';
import { buildFeishuAnswerCard } from './answer-card';

describe('buildFeishuAnswerCard', () => {
  it('uses lark markdown for an answer and its citation links', () => {
    expect(
      buildFeishuAnswerCard('**答案**\n\n- 第一项', [
        { title: 'A [page]', url: 'https://wiki.example.com/a' },
      ]),
    ).toEqual({
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: 'Wiki 问答' },
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: '**答案**\n\n- 第一项' } },
        { tag: 'hr' },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '**来源**\n- [A \\[page\\]](https://wiki.example.com/a)',
          },
        },
      ],
    });
  });

  it('does not add a sources section when there are no citations', () => {
    const card = buildFeishuAnswerCard('没有来源。', []);
    expect(card.elements).toEqual([{ tag: 'div', text: { tag: 'lark_md', content: '没有来源。' } }]);
  });
});
