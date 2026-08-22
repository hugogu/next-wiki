/**
 * Normalize block display-math (`$$…$$`) so multi-line blocks always render.
 *
 * remark-math parses a block `$$` fence like a fenced code block: any text
 * after the opening `$$` on the same line is treated as an info string and
 * discarded, and the closing `$$` is only recognized when it sits alone on its
 * line. So a block authored as
 *
 *     $$\Sigma = \begin{bmatrix}
 *     a & b \\ c & d
 *     \end{bmatrix}$$
 *
 * silently loses its first line and never closes, yielding a KaTeX parse error.
 * The only form that always works is delimiters on their own lines.
 *
 * This rewrites multi-line `$$…$$` blocks so both delimiters are isolated onto
 * their own lines. Single-line `$$…$$` (which remark-math treats as inline
 * math) and anything inside fenced code blocks are left untouched.
 */

/** Matches a fenced code block's opening line (``` or ~~~), capturing the fence marker. */
const CODE_FENCE = /^([ \t]*)(`{3,}|~{3,})/;

/**
 * Run `transform` over each contiguous region of `source` that sits outside a
 * fenced code block, leaving fenced lines (including the fence markers
 * themselves) untouched.
 *
 * Regions are passed whole rather than line by line: the inline constructs
 * these preprocessing steps care about — code spans, math spans, multi-line
 * `$$…$$` blocks — can all span several lines, and a per-line view would
 * mis-parse them.
 */
function mapRegionsOutsideFences(source: string, transform: (region: string) => string): string {
  const out: string[] = [];
  let buffer: string[] = [];
  let openFence: string | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    out.push(transform(buffer.join('\n')));
    buffer = [];
  };

  for (const line of source.split('\n')) {
    // CRLF input leaves a trailing `\r` on every line, which would stop the
    // `$`-anchored closing-fence pattern from ever matching — leaving the fence
    // stuck open and silently skipping every transform for the rest of the
    // document. Match against the line without it, but keep the original text
    // so the source still round-trips byte for byte.
    const content = line.endsWith('\r') ? line.slice(0, -1) : line;

    if (openFence) {
      out.push(line);
      // A closing fence is the same marker character, at least as long.
      if (new RegExp(`^[ \\t]*${openFence[0]}{${openFence.length},}[ \\t]*$`).test(content)) {
        openFence = null;
      }
      continue;
    }
    const fence = CODE_FENCE.exec(content);
    if (fence) {
      flush();
      out.push(line);
      openFence = fence[2]!;
      continue;
    }
    buffer.push(line);
  }
  flush();

  return out.join('\n');
}

/** Move the delimiters of every multi-line `$$…$$` block onto their own lines. */
function rewriteBlocks(text: string): string {
  // Opening `$$` must start a line (≤3 spaces indent, like a fence); the
  // closing `$$` must end its line. Only blocks that span multiple lines are
  // reformatted — single-line `$$…$$` stays as-is.
  return text.replace(
    /(^|\n)([ \t]{0,3})\$\$([\s\S]*?)\$\$[ \t]*(?=\n|$)/g,
    (whole, lineBreak: string, indent: string, inner: string) => {
      if (!inner.includes('\n')) return whole;

      // Keep a display-math block inside its parent list/blockquote. The
      // previous implementation trimmed the content and emitted the closing
      // delimiter at column zero. For an ordered-list continuation such as
      // `   $$`, that prematurely ended the list, so remark-math left the TeX
      // body as ordinary Markdown text.
      const content = inner
        .trim()
        .split('\n')
        .map((line) => (indent && line.startsWith(indent) ? line.slice(indent.length) : line))
        .map((line) => `${indent}${line}`)
        .join('\n');
      return `${lineBreak}${indent}$$\n${content}\n${indent}$$`;
    },
  );
}

export function normalizeDisplayMath(source: string): string {
  if (!source.includes('$$')) return source;
  return mapRegionsOutsideFences(source, rewriteBlocks);
}
