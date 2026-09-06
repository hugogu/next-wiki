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
  return decodeEntities(
    html
      .replace(
        /<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/tr|\/td|\/th)[^>]*>/gi,
        '\n',
      )
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decode the five HTML entities the renderer actually emits. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
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

/**
 * Drop a leading heading whose text merely repeats the page title.
 *
 * Wiki bodies conventionally open with an `# Title` heading that duplicates
 * the page title. Every share surface (link preview cards, search snippets)
 * already shows the title on its own line, so leaving the duplicate in the
 * description wastes the whole snippet on words the reader just read.
 *
 * Only an *exact* (whitespace/case-normalized) repeat is removed — a genuine
 * first section heading such as `## Overview` is left alone.
 */
export function stripLeadingTitleHeading(html: string, title: string): string {
  if (!html || !title) return html;
  const match = html.match(/^\s*<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i);
  if (!match) return html;
  if (normalizeForCompare(htmlToText(match[2] ?? '')) !== normalizeForCompare(title)) return html;
  return html.slice(match[0].length);
}

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** An image referenced by rendered page HTML. */
export interface ContentImageRef {
  /** The `src` as authored, entity-decoded: app-relative or absolute. */
  url: string;
  /** The `alt` text, or null when the image carries none. */
  alt: string | null;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const ALT_ATTR = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Collect the images a rendered page body references, in document order.
 *
 * Deliberately regex-based rather than a real parse: the input is our own
 * renderer's output, and the only consumer is link-preview metadata, where a
 * missed exotic `<img>` costs nothing. Inline `data:` sources are skipped —
 * no crawler can fetch one — as are tags without a usable `src`.
 *
 * `limit` bounds how many candidates a caller has to validate downstream; the
 * share image is virtually always the first or second image on the page.
 */
export function extractContentImages(html: string, limit = 8): ContentImageRef[] {
  if (!html) return [];
  const refs: ContentImageRef[] = [];
  for (const [tag] of html.matchAll(IMG_TAG)) {
    if (refs.length >= limit) break;
    const src = tag.match(SRC_ATTR);
    const url = decodeEntities(src?.[1] ?? src?.[2] ?? '').trim();
    if (!url || url.startsWith('data:')) continue;
    const alt = tag.match(ALT_ATTR);
    const altText = decodeEntities(alt?.[1] ?? alt?.[2] ?? '').trim();
    refs.push({ url, alt: altText || null });
  }
  return refs;
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