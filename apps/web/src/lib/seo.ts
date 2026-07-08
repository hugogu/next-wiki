/**
 * SEO helpers for derived metadata.
 *
 * We avoid storing per-page SEO fields in the database for the MVP. Instead we
 * compute the Open Graph / Twitter / meta description on the fly from the page
 * content. Keeping this logic in one place makes the metadata generation in
 * app routes easy to read and easy to test in isolation.
 */

/**
 * Strip HTML tags and collapse whitespace into single spaces.
 *
 * Intentionally conservative: it does not try to be a full HTML parser. The
 * output is meant for `<meta>` description tags, not for re-rendering.
 *
 * Behavior:
 *  - Replaces `<br>`, `<p>`, `<div>`, `<li>`, and block-level closing tags with
 *    a newline so paragraphs survive as paragraph breaks.
 *  - Removes all other tags (including their attributes).
 *  - Decodes the five HTML entities the renderer actually emits (`&amp;`,
 *    `&lt;`, `&gt;`, `&quot;`, `&#39;`).
 *  - Collapses runs of whitespace (incl. newlines) into a single space and
 *    trims the result.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(
      /<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/tr|\/td|\/th)[^>]*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick the first paragraph from an HTML body and clamp it to `maxLength`.
 *
 * Search engines typically display ~155-160 characters in the SERP snippet.
 * We aim a little shorter (160) so the description still reads naturally when
 * the first paragraph is shorter than the cap.
 *
 * Returns `fallback` when the input is empty or yields no usable text. The
 * fallback is also returned (unchanged) if it already fits within `maxLength`,
 * which makes the caller contract simple: "give me a usable description".
 */
export function buildPageDescription(
  html: string,
  fallback: string,
  maxLength = 160,
): string {
  const text = htmlToText(html);
  if (!text) return clamp(fallback, maxLength);

  // Split on sentence terminators first; fall back to the first whitespace
  // boundary if the first "sentence" is already too long.
  const firstSentenceMatch = text.match(/^[\s\S]*?(?:[.!?](?=\s)|$)/);
  const firstSentence = firstSentenceMatch
    ? firstSentenceMatch[0].trim()
    : text;

  if (firstSentence.length <= maxLength) {
    return clamp(firstSentence, maxLength);
  }
  // The first "sentence" is too long on its own. Pick the longest leading
  // sentence that still fits, otherwise fall through to a hard char clamp.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let acc = '';
  for (const s of sentences) {
    const next = acc ? `${acc} ${s}` : s;
    if (next.length > maxLength) break;
    acc = next;
  }
  if (acc) return clamp(acc, maxLength);
  return clamp(text, maxLength);
}

function clamp(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  // Trim to the last whitespace inside the cap so we never end on a half word.
  const sliced = value.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return sliced.slice(0, lastSpace).replace(/[.,;:!?-]+$/, '') + '…';
  }
  return sliced + '…';
}