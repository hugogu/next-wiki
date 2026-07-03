import type { AiCitation, AiSearchResult } from '@next-wiki/shared';

export type QuestionSource = AiCitation & { id: string; content: string };

export function buildWikiQuestionPrompt(question: string, sources: QuestionSource[]) {
  const sourceText = sources
    .map((source) => `<source id="${source.id}" title="${source.title}" path="${source.path}">\n${source.content}\n</source>`)
    .join('\n\n');
  return {
    system:
      'You are a helpful Wiki assistant. Use only the supplied Wiki sources to answer. ' +
      'Cite factual claims with source ids such as [S1]. ' +
      'If the user asks which page contains or mentions something, answer with the page title and cite the relevant source; ' +
      'do not spell out the raw page path as plain text, the citation link already carries it. ' +
      'Format every mathematical expression using Markdown math syntax: wrap inline math in single dollar signs like $x^2$ ' +
      'and block/display math in double dollar signs on their own lines like $$\\int_0^1 x\\,dx$$. Never emit bare LaTeX without dollar-sign delimiters. ' +
      'If the sources truly do not support any answer, respond exactly with INSUFFICIENT_WIKI_EVIDENCE. Do not invent citations.',
    user: `${sourceText}\n\n<question>\n${question}\n</question>`,
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
  const ids = [...text.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]!);
  return [...new Set(ids)]
    .map((id) => allowed.get(id))
    .filter((source): source is QuestionSource => Boolean(source))
    .map(({ id: _id, content: _content, ...citation }) => citation);
}

export function isInsufficientAnswer(text: string, sources: QuestionSource[]): boolean {
  return sources.length === 0 || text.trim() === 'INSUFFICIENT_WIKI_EVIDENCE';
}
