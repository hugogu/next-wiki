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
 * Add stable `id` attributes to h2-h6 headings so the outline can link to them.
 * Headings that already have a non-generic id are left untouched; ids that are
 * the empty fallback ('heading') are regenerated so duplicated fallbacks don't
 * break navigation.
 */
export function injectHeadingIds(html: string): string {
  return html.replace(headingRegex(), (full, tag, attrs, content) => {
    const existingId = extractExistingId(attrs);
    if (existingId && existingId !== 'heading') return full;
    const text = decodeHtmlEntities(stripHtmlTags(content)).trim();
    const id = slugify(text);
    const cleanedAttrs = attrs
      .replace(/\bid\s*=\s*(["'])([^"']*)\1\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `<${tag}${cleanedAttrs ? ` ${cleanedAttrs}` : ''} id="${id}">${content}</${tag}>`;
  });
}
