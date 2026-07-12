const HEADING_RE = /<(h[2-6])\b([^>]*)>([\s\S]*?)<\/\1>/g;

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
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
 * because h1 is treated as the page title.
 */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex to allow repeated calls on the same string.
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(html)) !== null) {
    const level = parseInt(match[1]!.slice(1), 10);
    const text = decodeHtmlEntities(stripHtmlTags(match[3]!)).trim();
    if (!text) continue;
    headings.push({ level, text, id: slugify(text) });
  }
  return headings;
}

/**
 * Add stable `id` attributes to h2-h6 headings so the outline can link to them.
 * Headings that already have an id are left untouched.
 */
export function injectHeadingIds(html: string): string {
  return html.replace(HEADING_RE, (full, tag, attrs, content) => {
    if (/\bid\s*=/.test(attrs)) return full;
    const text = decodeHtmlEntities(stripHtmlTags(content)).trim();
    const id = slugify(text);
    return `<${tag}${attrs} id="${id}">${content}</${tag}>`;
  });
}
