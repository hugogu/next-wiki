const HEADING_RE_SOURCE = /<(h[2-6])\b([^\u003e]*)>([\s\S]*?)\u003c\/\1>/;

function headingRegex(): RegExp {
  return new RegExp(HEADING_RE_SOURCE.source, 'g');
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^\u003e]+>/g, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractExistingId(attrs: string): string | null {
  const match = attrs.match(/\bid\s*=\s*(["'])([^"']*)\1/);
  return match?.[2] ?? null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    || 'heading';
}

export type Heading = {
  level: number;
  text: string;
  id: string;
};

/**
 * Extract a navigable outline from rendered HTML. Only h2-h6 are collected
 * because h1 is treated as the page title. If a heading already has an id
 * attribute, it is reused so the outline links stay in sync with the DOM.
 */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  for (const match of html.matchAll(headingRegex())) {
    const tag = match[1]!;
    const attrs = match[2]!;
    const content = match[3]!;
    const level = parseInt(tag.slice(1), 10);
    const text = decodeHtmlEntities(stripHtmlTags(content)).trim();
    if (!text) continue;
    const id = extractExistingId(attrs) ?? slugify(text);
    headings.push({ level, text, id });
  }
  return headings;
}

/**
 * Return `base` if it has not been used, otherwise the first free
 * `base-2`, `base-3`, ... variant. Records the chosen id in `seen` so repeated
 * heading text (e.g. several "概述" sections) yields unique, stable anchors.
 */
function uniqueId(base: string, seen: Set<string>): string {
  let id = base;
  for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
  seen.add(id);
  return id;
}

/**
 * Add stable, unique `id` attributes to h2-h6 headings so the outline can link
 * to them. Headings that already have a non-generic id are left untouched (but
 * still reserve that id); ids that are the empty fallback ('heading') or that
 * would collide with an earlier heading are regenerated with a numeric suffix
 * so duplicated headings don't break navigation.
 */
export function injectHeadingIds(html: string): string {
  const seen = new Set<string>();
  return html.replace(headingRegex(), (full, tag, attrs, content) => {
    const existingId = extractExistingId(attrs);
    if (existingId && existingId !== 'heading') {
      seen.add(existingId);
      return full;
    }
    const text = decodeHtmlEntities(stripHtmlTags(content)).trim();
    const id = uniqueId(slugify(text), seen);
    const cleanedAttrs = attrs
      .replace(/\bid\s*=\s*(["'])([^"']*)\1\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `<${tag}${cleanedAttrs ? ` ${cleanedAttrs}` : ''} id="${id}">${content}</${tag}>`;
  });
}
