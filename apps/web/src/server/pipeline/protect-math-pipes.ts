/**
 * Protect literal `|` characters inside inline/single-line math (`$…$` or
 * `$$…$$`) from being misread as GFM table-cell delimiters.
 *
 * remark-gfm splits a table row into cells on every unescaped `|`, and only
 * special-cases backtick code spans (mirroring GitHub's own table parser) —
 * it has no idea `$…$` is a math span, so a formula like an absolute value
 * `$|x| < 1/2$` inside a table cell gets sliced apart mid-formula, and the
 * rest of the row is silently dropped.
 *
 * This swaps every such `|` for a private-use placeholder before Markdown
 * parsing (so table-cell splitting skips over it) and `restoreMathPipes`
 * swaps it back inside the parsed `math`/`inlineMath` mdast nodes before
 * KaTeX ever sees it — a no-op everywhere outside a table cell.
 */

import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { mapLinesOutsideFences } from './code-fence-utils';

const MATH_PIPE_PLACEHOLDER = '';

// `$$…$$` first so it isn't mistaken for two adjacent `$…$` spans; neither
// alternative crosses a backtick code span (handled separately below) or a
// newline (table cells are inherently single-line, so that's the only place
// this matters).
const MATH_SPAN = /\$\$[^$]*?\$\$|\$[^$]*?\$/g;

function protectPipesOnLine(line: string): string {
  return line
    .split(/(`[^`]*`)/)
    .map((segment, index) =>
      // Odd indices are the captured backtick spans: verbatim code, never math.
      index % 2 === 1 ? segment : segment.replace(MATH_SPAN, (span) => span.replaceAll('|', MATH_PIPE_PLACEHOLDER)),
    )
    .join('');
}

export function protectMathPipes(source: string): string {
  if (!source.includes('$') || !source.includes('|')) return source;
  return mapLinesOutsideFences(source, protectPipesOnLine);
}

type HastLike = { value?: unknown; children?: HastLike[] };

/**
 * `mdast-util-math` bakes the raw TeX into `node.data.hChildren` (a nested
 * hast text node) at parse time — that's what `remark-rehype` actually
 * renders from, not `node.value` — so the placeholder has to be restored
 * there too, recursively, or it survives straight through to KaTeX.
 */
function restorePipesInHastChildren(children: unknown): void {
  if (!Array.isArray(children)) return;
  for (const child of children as HastLike[]) {
    if (typeof child.value === 'string') {
      child.value = child.value.replaceAll(MATH_PIPE_PLACEHOLDER, '|');
    }
    restorePipesInHastChildren(child.children);
  }
}

export function restoreMathPipes(tree: Root) {
  visit(tree, (node) => {
    if (node.type !== 'math' && node.type !== 'inlineMath') return;
    const mathNode = node as { value?: string; data?: { hChildren?: unknown } };
    if (typeof mathNode.value === 'string') {
      mathNode.value = mathNode.value.replaceAll(MATH_PIPE_PLACEHOLDER, '|');
    }
    restorePipesInHastChildren(mathNode.data?.hChildren);
  });
}
