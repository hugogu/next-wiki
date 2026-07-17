import type { AiCitation, AiSearchResult } from '@next-wiki/shared';

export type QuestionSource = AiCitation & { id: string; content: string };

/**
 * Matches a citation marker in either plain ASCII brackets ([S1]) or the
 * full-width brackets (【S1】) models sometimes substitute when answering in
 * CJK locales — both must be recognized or citations silently vanish.
 */
const CITATION_MARKER = /[\[【](S\d+)[\]】]/g;

export function buildWikiQuestionPrompt(
  question: string,
  sources: QuestionSource[],
  conversation: { question: string; answer: string }[] = [],
) {
  const sourceText = sources
    .map(
      (source) =>
        `<source id="${source.id}" title="${source.title}" path="${source.path}">\n${source.content}\n</source>`,
    )
    .join('\n\n');
  return {
    system:
      'You are a helpful Wiki assistant. Use only the supplied Wiki sources to answer. ' +
      'Conversation history may clarify references, but it is not a factual source and must not be cited. ' +
      'Cite factual claims with source ids in plain ASCII brackets exactly like [S1] — never full-width brackets such as 【S1】, even when answering in Chinese. ' +
      'If the user asks which page contains or mentions something, answer with the page title and cite the relevant source; ' +
      'do not spell out the raw page path as plain text, the citation link already carries it. ' +
      'Format every mathematical expression using Markdown math syntax: wrap inline math in single dollar signs like $x^2$ ' +
      'and block/display math in double dollar signs on their own lines like $$\\int_0^1 x\\,dx$$. Never emit bare LaTeX without dollar-sign delimiters. ' +
      'If the sources truly do not support any answer, respond exactly with INSUFFICIENT_WIKI_EVIDENCE. Do not invent citations.',
    user: `${sourceText}${conversation.length > 0 ? `\n\n<conversation>\n${conversation.map((turn) => `<turn><question>${turn.question}</question><answer>${turn.answer}</answer></turn>`).join('\n')}\n</conversation>` : ''}\n\n<question>\n${question}\n</question>`,
  };
}

export function searchResultsToSources(results: AiSearchResult[]): QuestionSource[] {
  return results.map((result, index) => ({
    id: `S${index + 1}`,
    pageId: result.pageId,
    title: result.title,
    path: result.path,
    locale: result.locale,
    revisionId: result.revisionId,
    revisionHash: result.revisionHash,
    content: result.excerpt,
  }));
}

export function normalizeQuestionCitations(text: string, sources: QuestionSource[]): AiCitation[] {
  const allowed = new Map(sources.map((source) => [source.id, source]));
  const ids = [...text.matchAll(CITATION_MARKER)].map((match) => match[1]!);
  return [...new Set(ids)]
    .map((id) => allowed.get(id))
    .filter((source): source is QuestionSource => Boolean(source))
    .map(({ id: _id, content: _content, ...citation }) => citation);
}

export function isInsufficientAnswer(text: string, sources: QuestionSource[]): boolean {
  return sources.length === 0 || text.trim() === 'INSUFFICIENT_WIKI_EVIDENCE';
}

/**
 * Rough token estimate for a built prompt. Four characters per token is the
 * standard heuristic for English/markdown; CJK is denser, but the generous
 * safety margins in {@link computeAnswerMaxOutputTokens} absorb the difference.
 */
export function estimatePromptTokens(system: string, user: string): number {
  return Math.ceil((system.length + user.length) / 4);
}

// A Wiki answer never needs the whole window; cap it so a bogus per-model
// output limit can't consume the entire context and starve the input.
const ANSWER_TOKEN_CEILING = 8192;

/**
 * Choose a safe `max_tokens` for a Wiki answer. Two failure modes motivate
 * this: (1) some catalog models report `maxOutputTokens` equal to their full
 * context window, and (2) omitting `max_tokens` makes several providers (e.g.
 * OpenRouter) default the output budget to the entire remaining window — either
 * way `input + requested output` exceeds the context limit and the request
 * 400s. Cap the answer to a generous ceiling and always subtract the estimated
 * prompt so the two together fit the window.
 */
export function computeAnswerMaxOutputTokens(
  estPromptTokens: number,
  contextWindow: number | null,
  modelMaxOutput: number | null,
): number {
  let maxOut = Math.min(modelMaxOutput ?? ANSWER_TOKEN_CEILING, ANSWER_TOKEN_CEILING);
  if (contextWindow && contextWindow > 0) {
    maxOut = Math.min(maxOut, contextWindow - estPromptTokens - 512);
  }
  return Math.max(512, maxOut);
}

/**
 * Shrink attached sources when a request still overflows the context window.
 * Halves each source's body (keeping the more salient head) and drops any that
 * become empty, so a compressed retry sends materially less text while keeping
 * the citation ids stable for the sources that survive.
 */
export function compressQuestionSources(sources: QuestionSource[]): QuestionSource[] {
  return sources
    .map((source) => ({
      ...source,
      content: source.content.slice(0, Math.floor(source.content.length / 2)).trimEnd(),
    }))
    .filter((source) => source.content.length > 0);
}
