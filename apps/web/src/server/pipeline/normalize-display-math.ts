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

const CODE_FENCE = /^([ \t]*)(`{3,}|~{3,})/;

/** Move the delimiters of every multi-line `$$…$$` block onto their own lines. */
function rewriteBlocks(text: string): string {
  // Opening `$$` must start a line (≤3 spaces indent, like a fence); the
  // closing `$$` must end its line. Only blocks that span multiple lines are
  // reformatted — single-line `$$…$$` stays as-is.
  return text.replace(
    /(^|\n)([ \t]{0,3})\$\$([\s\S]*?)\$\$[ \t]*(?=\n|$)/g,
    (whole, lineBreak: string, indent: string, inner: string) => {
      if (!inner.includes('\n')) return whole;
      return `${lineBreak}${indent}$$\n${inner.trim()}\n$$`;
    },
  );
}

export function normalizeDisplayMath(source: string): string {
  if (!source.includes('$$')) return source;

  const lines = source.split('\n');
  const out: string[] = [];
  let buffer: string[] = [];
  let openFence: string | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    out.push(rewriteBlocks(buffer.join('\n')));
    buffer = [];
  };

  for (const line of lines) {
    if (openFence) {
      out.push(line);
      // A closing fence is the same marker character, at least as long.
      if (new RegExp(`^[ \\t]*${openFence[0]}{${openFence.length},}[ \\t]*$`).test(line)) {
        openFence = null;
      }
      continue;
    }
    const fence = CODE_FENCE.exec(line);
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
