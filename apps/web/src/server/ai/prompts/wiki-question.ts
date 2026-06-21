import type { AiCitation, AiSearchResult } from '@next-wiki/shared';

export type QuestionSource = AiCitation & { id: string; content: string };

export function buildWikiQuestionPrompt(question: string, sources: QuestionSource[]) {
  const sourceText = sources
    .map((source) => `<source id="${source.id}" title="${source.title}" path="${source.path}">\n${source.content}\n</source>`)
    .join('\n\n');
  return {
    system:
      'Answer only from the supplied Wiki sources. Cite factual claims with source ids such as [S1]. ' +
      'If the sources do not support an answer, respond exactly with INSUFFICIENT_WIKI_EVIDENCE. Do not invent citations.',
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
