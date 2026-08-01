/**
 * Mark parts of a rendered page that should not reach the search index.
 *
 * The pipeline's output contains text a reader never sees: KaTeX emits a hidden
 * MathML copy carrying the raw LaTeX alongside the visual rendering, and a
 * mermaid block keeps its graph definition in a `<pre>` until the client
 * replaces it with an SVG. Both are rendering instructions, not prose. Left
 * marked for indexing they pollute result excerpts with things like
 * `\frac{1}{3}` and `graph TD; A[Wiki] -->`, and they match queries no reader
 * meant to make.
 *
 * Applied to the body HTML only, after link rewriting — the document shell's
 * own chrome is excluded separately.
 */

/** Add `data-pagefind-ignore` to an opening tag that does not already have it. */
function ignoreTag(tag: string): string {
  return tag.includes('data-pagefind-ignore')
    ? tag
    : tag.replace(/^<(\w+)/, '<$1 data-pagefind-ignore');
}

export function markNonIndexableContent(html: string): string {
  return (
    html
      // The mermaid source lives here until the client swaps in an SVG.
      .replace(/<div\b[^>]*\bdata-mermaid-block\b[^>]*>/gi, ignoreTag)
      // KaTeX's accessibility copy duplicates every formula as raw LaTeX.
      .replace(/<span class="katex-mathml">/gi, '<span class="katex-mathml" data-pagefind-ignore>')
  );
}
