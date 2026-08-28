import type { WikiMemoryClient } from './api-client';

const MAX_QUERY = 4_000;

function escapeExternalText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/<\/?external-memory>/giu, '');
}

export async function externalContext(
  client: WikiMemoryClient,
  query: string,
  limits: { maxResults: number; maxCharacters: number },
): Promise<string | null> {
  const normalized = query.trim().slice(0, MAX_QUERY);
  if (!normalized) return null;
  try {
    const response = await client.recall(normalized, 'granted', limits.maxResults);
    const text = response.results.map((result) => `[External memory]\n${escapeExternalText(result.excerpt)}\nSource: ${escapeExternalText(result.citation.canonicalUrl)} (revision ${escapeExternalText(result.citation.revisionId)})`).join('\n\n');
    return text ? `<external-memory>\n${text.slice(0, limits.maxCharacters)}\n</external-memory>` : null;
  } catch {
    return null;
  }
}
