import type { AiCitation } from '@next-wiki/shared';

/**
 * Matches a citation marker in either plain ASCII brackets ([S1]) or the
 * full-width brackets (【S1】) models sometimes substitute when answering in
 * CJK locales. Kept in sync with CITATION_MARKER in
 * apps/web/src/server/ai/prompts/wiki-question.ts, which extracts the same
 * markers server side to build the `citations` array.
 */
const CITATION_MARKER = /[\[【](S\d+)[\]】]/g;

/**
 * Turns citation markers in an assistant answer into Markdown links pointing
 * at the cited page, always normalized to ASCII `[S1](url)` syntax so remark
 * recognizes them regardless of which bracket style the model used. Citations
 * are matched by first-appearance order, mirroring how
 * `normalizeQuestionCitations` (server side) builds the `citations` array.
 */
export function linkifyCitationMarkers(text: string, citations: AiCitation[] | undefined): string {
  if (!citations?.length) return text;

  const order: string[] = [];
  for (const match of text.matchAll(CITATION_MARKER)) {
    const id = match[1]!;
    if (!order.includes(id)) order.push(id);
  }
  const citationById = new Map(order.map((id, index) => [id, citations[index]]));

  return text.replace(CITATION_MARKER, (_match, id: string) => {
    const citation = citationById.get(id);
    return citation ? `[${id}](/${citation.path})` : `[${id}]`;
  });
}
