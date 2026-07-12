const FIRST_H1_RE = /<h1\b[^>]*>[\s\S]*?<\/h1>/;

/**
 * Strip the first `<h1>` from a rendered HTML fragment. Used on the public page
 * reader so the title can be rendered in a shared header row with tags and the
 * share button without duplicating the heading inside the article body.
 */
export function removeFirstH1(html: string): string {
  const match = html.match(FIRST_H1_RE);
  if (!match || match.index === undefined) return html;
  return html.slice(0, match.index) + html.slice(match.index + match[0].length);
}
