import type { AiCitation } from '@next-wiki/shared';

/**
 * Turns bare `[S1]`, `[S2]`, ... citation markers in an assistant answer into
 * Markdown links pointing at the cited page. Citations are matched by first
 * appearance order, mirroring how `normalizeQuestionCitations` (server side)
 * builds the `citations` array from the same marker order.
 */
export function linkifyCitationMarkers(text: string, citations: AiCitation[] | undefined): string {
  if (!citations?.length) return text;

  const order: string[] = [];
  for (const [marker] of text.matchAll(/\[S\d+\]/g)) {
    if (!order.includes(marker)) order.push(marker);
  }
  const citationByMarker = new Map(order.map((marker, index) => [marker, citations[index]]));

  return text.replace(/\[S\d+\]/g, (marker) => {
    const citation = citationByMarker.get(marker);
    return citation ? `${marker}(/${citation.path})` : marker;
  });
}
