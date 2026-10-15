import { createRepetitionGuard, RepetitionDetector, type RepetitionFinding } from './repetition';

/** Small deterministic generator, so "unpredictable" text is identical on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomWord(next: () => number, min: number, max: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz_';
  const length = min + Math.floor(next() * (max - min + 1));
  return Array.from({ length }, () => alphabet.charAt(Math.floor(next() * alphabet.length))).join('');
}

/** Non-repeating filler: random words from a large vocabulary never share a 32-byte run. */
function varied(chars: number, seed: number): string {
  const next = seeded(seed);
  const vocabulary = Array.from({ length: 600 }, () => randomWord(next, 3, 10));
  let text = '';
  while (text.length < chars) {
    text += `${vocabulary[Math.floor(next() * vocabulary.length)]}${next() < 0.12 ? '.\n' : ' '}`;
  }
  return text.slice(0, chars);
}

/** The loop from the bug report: one phrase, with a single word changing each round. */
function changingWordLoop(rounds: number): string {
  const next = seeded(7);
  return Array.from(
    { length: rounds },
    () =>
      `We should also note that axis=-1 is used in pandas for \`DataFrame.${randomWord(next, 7, 14)}\`? Not directly.\n\nThus answer.\n\n`,
  ).join('');
}

/** Stream `text` in `chunkSize`-character pieces; report the first loop found. */
function detect(text: string, chunkSize = 24): RepetitionFinding | null {
  const detector = new RepetitionDetector();
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    const finding = detector.push(text.slice(offset, offset + chunkSize));
    if (finding) return finding;
  }
  return null;
}

describe('RepetitionDetector', () => {
  // `maxBytes` is the latency budget: how much of a loop may stream before it is stopped.
  const loops: Array<{ name: string; text: string; maxBytes: number }> = [
    { name: 'a short sentence over and over', text: 'Thus answer.\n\n'.repeat(1_500), maxBytes: 4_096 },
    { name: 'a sixty-byte sentence over and over', text: 'Let me think about this again and then give the answer.\n'.repeat(800), maxBytes: 6_144 },
    { name: 'a single character', text: '!'.repeat(40_000), maxBytes: 4_096 },
    { name: 'blank lines', text: '\n'.repeat(40_000), maxBytes: 4_096 },
    { name: 'numbered lines with a counter', text: Array.from({ length: 800 }, (_, i) => `${i + 1}. We should check the final answer once more.\n`).join(''), maxBytes: 8_192 },
    { name: 'the same sentence with one changing word (bug report)', text: changingWordLoop(500), maxBytes: 16_384 },
    {
      name: 'a paragraph with a changing number',
      text: Array.from(
        { length: 200 },
        (_, i) =>
          `We need to produce the final answer for the user (attempt ${100 + (i % 900)}). The user asked about axis=-1 in numpy and pandas, so we should explain that negative axes count from the last dimension and give two examples.\n\n`,
      ).join(''),
      maxBytes: 16_384,
    },
    { name: 'a long paragraph repeated', text: varied(1_200, 11).repeat(40), maxBytes: 24_576 },
    { name: 'Chinese text over and over', text: '综上所述，我们应当直接给出最终答案，不再继续分析。\n'.repeat(800), maxBytes: 8_192 },
    {
      name: 'Chinese text with a changing word',
      text: (() => {
        const next = seeded(5);
        return Array.from(
          { length: 600 },
          () =>
            `我们还应该注意，在 pandas 中 axis=-1 也适用于“${Array.from({ length: 2 + Math.floor(next() * 3) }, () => String.fromCharCode(0x4e00 + Math.floor(next() * 3000))).join('')}”方法，但并不是直接适用。\n所以答案如下。\n`,
        ).join('');
      })(),
      maxBytes: 16_384,
    },
  ];

  it.each(loops)('stops $name', ({ text, maxBytes }) => {
    const finding = detect(text);
    expect(finding).not.toBeNull();
    expect(finding!.streamedBytes).toBeLessThanOrEqual(maxBytes);
    expect(finding!.coverage).toBeGreaterThanOrEqual(0.86);
  });

  it.each([1, 7, 64, 5_000])('finds the loop whatever the chunk size (%i)', (chunkSize) => {
    for (const text of [changingWordLoop(500), 'Thus answer.\n\n'.repeat(1_500)]) {
      const finding = detect(text, chunkSize);
      expect(finding).not.toBeNull();
      // Detection runs once per KB streamed, so the chunk size can only shift it by that much.
      expect(finding!.streamedBytes).toBeLessThanOrEqual(16_384 + 1_024 + chunkSize);
    }
  });

  // Ordinary and merely regular output must never be mistaken for a loop. Sizes
  // are realistic answer sizes; the measured scores are well below every limit.
  const legitimate: Array<{ name: string; text: string }> = [
    { name: 'varied prose', text: varied(60_000, 1) },
    {
      name: 'a SQL dump of 100 rows',
      text: Array.from({ length: 100 }, (_, i) => `INSERT INTO users (id, name, email, created_at) VALUES (${i + 1}, 'user${i * 13}', 'user${i * 13}@example.com', now());`).join('\n'),
    },
    {
      name: 'a 200-row Markdown table',
      text:
        '| Name | Type | Required | Default | Description | Notes |\n| --- | --- | --- | --- | --- | --- |\n' +
        Array.from({ length: 200 }, (_, i) => `| field${i} | string | ${i % 2 ? 'yes' : 'no'} | \`null\` | The value of field number ${i * 3} | See section ${i % 9} |`).join('\n'),
    },
    {
      name: 'JSON rows',
      text: '[\n' + Array.from({ length: 200 }, (_, i) => `  {"id": ${1000 + i * 37}, "title": "Page about topic ${(i * 7919) % 977}", "path": "docs/area-${i % 13}/page-${i}", "tags": ["t${i % 5}"]},`).join('\n') + '\n]',
    },
    {
      name: 'numeric CSV',
      text: Array.from({ length: 600 }, (_, i) => `${i},${(i * 31) % 97},${(i * 17) % 53},${(i * 101) % 211},2024-01-${String((i % 28) + 1).padStart(2, '0')}`).join('\n'),
    },
    {
      name: 'an 80-item HTML list',
      text: '<ul>\n' + Array.from({ length: 80 }, (_, i) => `  <li class="menu-item menu-item-type-post_type"><a href="/docs/item-${i}">Item ${i}</a></li>`).join('\n') + '\n</ul>',
    },
    {
      name: 'an 80-entry YAML list',
      text: Array.from({ length: 80 }, (_, i) => `- name: service-${i}\n  image: registry.example.com/team/service-${i}:1.${i}.0\n  replicas: ${(i % 4) + 1}\n  enabled: true`).join('\n'),
    },
    {
      name: 'repetitive test cases',
      text: Array.from({ length: 120 }, (_, i) => `  it('handles input number ${i} correctly', () => {\n    expect(normalize(inputs[${i}])).toEqual(expected[${i}]);\n  });`).join('\n\n'),
    },
    { name: 'a heading underline', text: `Title\n${'='.repeat(200)}\n\nBody text follows here with more content to read.\n` },
  ];

  it.each(legitimate)('leaves $name alone', ({ text }) => {
    expect(detect(text)).toBeNull();
  });

  it('does not treat a block copied from far earlier as a loop', () => {
    const block = varied(2_048, 3);
    expect(detect(block + varied(12_000, 4) + block)).toBeNull();
  });

  it('measures bytes, not characters', () => {
    const detector = new RepetitionDetector();
    // 400 characters is 1,200 bytes: past the check interval but short of the smallest window.
    expect(detector.push('中'.repeat(400))).toBeNull();
    const finding = detector.push('中'.repeat(400));
    expect(finding).toMatchObject({ windowBytes: 2_048, streamedBytes: 2_400 });
  });

  it('ignores empty chunks', () => {
    const detector = new RepetitionDetector();
    expect(detector.push('')).toBeNull();
  });
});

describe('createRepetitionGuard', () => {
  it('attributes a loop to the channel it occurred in', () => {
    const reasoning = createRepetitionGuard();
    const content = createRepetitionGuard();
    let reasoningFinding: ReturnType<typeof reasoning.observe> = null;
    let contentFinding: ReturnType<typeof content.observe> = null;
    for (let i = 0; i < 400 && !reasoningFinding; i += 1) {
      reasoningFinding = reasoning.observe({ type: 'reasoning_delta', text: 'Thus answer.\n\n' });
    }
    for (let i = 0; i < 400 && !contentFinding; i += 1) {
      contentFinding = content.observe({ type: 'delta', text: 'Thus answer.\n\n' });
    }
    expect(reasoningFinding).toMatchObject({ channel: 'reasoning' });
    expect(contentFinding).toMatchObject({ channel: 'content' });
  });

  it('keeps reasoning and content apart', () => {
    // Each channel carries 1.8 KB of the same phrase: too little to be a loop on
    // its own, but a blended 3.6 KB stream would be flagged.
    const guard = createRepetitionGuard();
    const phrase = 'Thus answer.\n\n';
    for (let i = 0; i < 130; i += 1) {
      expect(guard.observe({ type: 'reasoning_delta', text: phrase })).toBeNull();
      expect(guard.observe({ type: 'delta', text: phrase })).toBeNull();
    }
  });

  it('ignores events that carry no text', () => {
    const guard = createRepetitionGuard();
    expect(guard.observe({ type: 'usage', outputTokens: 10 })).toBeNull();
    expect(guard.observe({ type: 'done', finishReason: 'stop' })).toBeNull();
    expect(guard.observe({ type: 'provider_request_id', id: 'req' })).toBeNull();
  });
});
