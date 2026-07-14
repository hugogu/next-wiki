import { describe, expect, it } from 'vitest';
import {
  appendFeishuAnswerSources,
  buildFeishuAnswerCard,
  buildFeishuStreamingAnswerCard,
  FEISHU_STREAM_ANSWER_ELEMENT_ID,
} from './answer-card';

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

describe('Feishu native streaming card', () => {
  it('uses the JSON 2.0 CardKit streaming contract and a stable markdown element id', () => {
    expect(buildFeishuStreamingAnswerCard('first token')).toMatchObject({
      schema: '2.0',
      config: { streaming_mode: true },
      body: {
        elements: [
          {
            tag: 'markdown',
            element_id: FEISHU_STREAM_ANSWER_ELEMENT_ID,
            content: 'first token',
          },
        ],
      },
    });
  });

  it('adds citations to the terminal markdown snapshot', () => {
    expect(
      appendFeishuAnswerSources('Answer', [{ title: 'A [page]', url: 'https://wiki.test/a' }]),
    ).toBe('Answer\n\n---\n**来源**\n- [A \\[page\\]](https://wiki.test/a)');
  });
});
