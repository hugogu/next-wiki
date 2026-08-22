/**
 * Protect literal `|` inside math spans from being misread as GFM table-cell
 * delimiters.
 *
 * remark-gfm splits a table row on every unescaped `|` at block level, before
 * any inline parsing, so it has no notion of `$…$` being math: a cell holding
 * `$|x| < 1/2$` is sliced apart mid-formula and the rest of the row is dropped.
 * `protectMathPipes` swaps those pipes for a placeholder before parsing;
 * `restoreMathPipes` puts them back in the parsed tree.
 *
 * Two invariants keep a placeholder from ever reaching the output or an author's
 * own text:
 *
 * - Only table rows are rewritten, and which lines those are comes from the
 *   parser rather than from matching row syntax here. Elsewhere a `|` splits
 *   nothing, so touching it could only strand a placeholder in some other
 *   construct.
 * - Restoration is limited to verbatim node types, and only runs when
 *   protection did. See `VERBATIM_NODE_TYPES` for why that matters.
 *
 * `renderMarkdown` re-renders without protection if a placeholder reaches the
 * output anyway, so a mis-scan costs a document the fix but never shows.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

// U+E000, the first Private Use Area codepoint. A single character rather than a
// longer sentinel, so the parser cannot tokenize it apart mid-flight; spelled via
// `fromCharCode` so it stays visible in diffs.
const MATH_PIPE_PLACEHOLDER = String.fromCharCode(0xe000);

/**
 * The `| --- |` row. Pipes cannot appear inside one, so it survives the bug
 * intact and identifies a table that failed to parse as such. Leading `>` and
 * indentation are tolerated so a quoted or nested row still matches.
 */
const TABLE_DELIMITER_ROW = /^[ \t>]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const isDelimiterRow = (line: string) => {
  // CRLF input leaves a trailing `\r` that the anchored pattern would reject.
  const content = line.endsWith('\r') ? line.slice(0, -1) : line;
  return content.includes('|') && TABLE_DELIMITER_ROW.test(content);
};

const rowFinder = unified().use(remarkParse).use(remarkMath).use(remarkGfm);

/**
 * The 1-indexed lines making up table rows.
 *
 * Asking the parser is what keeps this from having to know where a table ends —
 * a heading, a thematic break, a nested list item and a blank line all stop one,
 * and remark already applies those rules, in every container block, correctly.
 *
 * The one table it cannot report is the one this module exists to fix: when a
 * header's math contains pipes its cell count disagrees with the delimiter row,
 * so no table forms and remark yields a paragraph. Those are recovered by
 * looking for a delimiter row inside a paragraph, which is safe because a
 * paragraph ends wherever a block interrupts it — the same question, answered
 * by the parser again.
 */
function tableRowLines(source: string): Set<number> {
  const lines = source.split('\n');
  const rows = new Set<number>();

  visit(rowFinder.parse(source), (node) => {
    const position = node.position;
    if (!position) return;

    if (node.type === 'table') {
      for (let line = position.start.line; line <= position.end.line; line++) rows.add(line);
      return;
    }

    if (node.type !== 'paragraph') return;
    for (let line = position.start.line; line <= position.end.line; line++) {
      if (!isDelimiterRow(lines[line - 1] ?? '')) continue;
      // A table needs a header row above the delimiter, in the same paragraph.
      // Without one this is not a table that failed to form, just a line that
      // looks like a delimiter.
      if (line - 1 < position.start.line) continue;
      // Header directly above, body running to the paragraph's end.
      for (let row = line - 1; row <= position.end.line; row++) rows.add(row);
    }
  });

  return rows;
}

function runLength(text: string, start: number, char: string): number {
  let end = start;
  while (end < text.length && text[end] === char) end++;
  return end - start;
}

/**
 * Index of the run of exactly `length` `char`s closing a span opened at `from`,
 * or -1. Two behaviours verified against remark-math rather than assumed: a run
 * only closes a run of its own length (`$$a$$$` is not math), and a backslash
 * does *not* escape the closing delimiter (`$a \$ b$` is math with body `a \`).
 */
function findClosingRun(text: string, from: number, char: string, length: number): number {
  let index = from;
  while (index < text.length) {
    if (text[index] === char) {
      const run = runLength(text, index, char);
      if (run === length) return index;
      index += run;
      continue;
    }
    index++;
  }
  return -1;
}

/**
 * Rewrite the pipes inside this row's math spans. A container prefix (`> `, a
 * list marker) holds no `$`, so scanning the whole line is harmless.
 */
function protectPipesInRow(line: string): string {
  let out = '';
  let index = 0;

  while (index < line.length) {
    const char = line[index]!;

    // A character escape consumes both characters, so `\$` never opens a span.
    if (char === '\\') {
      out += line.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === '`' || char === '$') {
      const run = runLength(line, index, char);
      const close = findClosingRun(line, index + run, char, run);

      if (close === -1) {
        // Never closed, so the run is literal text rather than a delimiter.
        out += line.slice(index, index + run);
        index += run;
        continue;
      }

      const body = line.slice(index + run, close);
      out += line.slice(index, index + run);
      // Code spans are skipped, not protected: GFM splits cells before inline
      // parsing, so a pipe inside one genuinely does split the cell.
      out += char === '$' ? body.replaceAll('|', MATH_PIPE_PLACEHOLDER) : body;
      out += line.slice(close, close + run);
      index = close + run;
      continue;
    }

    out += char;
    index++;
  }

  return out;
}

export function protectMathPipes(source: string): string {
  if (!source.includes('$') || !source.includes('|')) return source;
  // With an authored placeholder present, restoration could not tell it from
  // one of ours. Declining costs this document the fix, nothing more.
  if (source.includes(MATH_PIPE_PLACEHOLDER)) return source;

  const rows = tableRowLines(source);
  if (rows.size === 0) return source;

  return source
    .split('\n')
    .map((line, index) => (rows.has(index + 1) ? protectPipesInRow(line) : line))
    .join('\n');
}

type HastLike = { value?: unknown; children?: HastLike[] };

/**
 * `mdast-util-math` bakes the raw TeX into `data.hChildren` at parse time, and
 * that — not `node.value` — is what `remark-rehype` renders from.
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

/**
 * Node types holding verbatim source. Character references are decoded *after*
 * this module scans the source and only in text positions, so restoring `text`
 * would turn an authored `&#xE000;` into a `|`. `html` is here because a table
 * cell can hold raw HTML and its value is still unparsed at this stage. Code
 * nodes are not: the parser never reports a code block as a table row, and the
 * scanner skips code spans, so a placeholder cannot reach either.
 */
const VERBATIM_NODE_TYPES = new Set(['math', 'inlineMath', 'html']);

/**
 * `enabled` must be false whenever `protectMathPipes` declined, so a document
 * carrying an author's own placeholder is left alone.
 */
export function restoreMathPipes(enabled: boolean) {
  return (tree: Root) => {
    if (!enabled) return;
    visit(tree, (node) => {
      if (!VERBATIM_NODE_TYPES.has(node.type)) return;
      const candidate = node as { value?: unknown; data?: { hChildren?: unknown } };
      if (typeof candidate.value === 'string') {
        candidate.value = candidate.value.replaceAll(MATH_PIPE_PLACEHOLDER, '|');
      }
      restorePipesInHastChildren(candidate.data?.hChildren);
    });
  };
}

// A placeholder reaching a URL is percent-encoded on the way out, so the literal
// character alone does not prove the output is clean. Derived from the
// placeholder so the two cannot drift apart.
const PERCENT_ENCODED_PLACEHOLDER = new RegExp(encodeURIComponent(MATH_PIPE_PLACEHOLDER), 'i');

/** Whether rendered output still carries a placeholder restoration missed. */
export function hasUnrestoredPlaceholder(html: string): boolean {
  return html.includes(MATH_PIPE_PLACEHOLDER) || PERCENT_ENCODED_PLACEHOLDER.test(html);
}
