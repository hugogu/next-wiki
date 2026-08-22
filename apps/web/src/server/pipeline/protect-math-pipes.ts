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
 * - Only table rows are rewritten. Elsewhere a `|` splits nothing, so touching
 *   it could only strand a placeholder in some other construct.
 * - Restoration is limited to verbatim node types, and only runs when
 *   protection did. See `VERBATIM_NODE_TYPES` for why that matters.
 *
 * `renderMarkdown` re-renders without protection if a placeholder reaches the
 * output anyway, so a mis-scan costs a document the fix but never shows.
 */

import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { mapRegionsOutsideFences } from './code-fence-utils';

// U+E000, the first Private Use Area codepoint. A single character rather than a
// longer sentinel, so the parser cannot tokenize it apart mid-flight; spelled via
// `fromCharCode` so it stays visible in diffs.
const MATH_PIPE_PLACEHOLDER = String.fromCharCode(0xe000);

/** The `| --- |` row: the one part of a table that cannot contain math. */
const TABLE_DELIMITER_ROW = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Appears only on a list item's opening line; continuations are indented. */
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+/;

const stripCarriageReturn = (line: string) => (line.endsWith('\r') ? line.slice(0, -1) : line);

const isBlank = (line: string) => line.trim() === '';

type LineParts = { prefix: string; content: string; depth: number };

/**
 * Split off the prefix container blocks repeat on every line they enclose, so a
 * nested table's rows look like rows again. CommonMark has exactly two container
 * blocks — block quotes and list items — so indentation, `>` and list markers
 * are the complete vocabulary.
 */
function splitContainerPrefix(line: string): LineParts {
  let index = 0;
  let depth = 0;

  for (;;) {
    while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index++;

    if (line[index] === '>') {
      index += 1;
      depth += 1;
      if (line[index] === ' ' || line[index] === '\t') index += 1;
      continue;
    }

    const marker = LIST_MARKER.exec(line.slice(index));
    if (!marker) break;
    index += marker[0].length;
  }

  return { prefix: line.slice(0, index), content: line.slice(index), depth };
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

/** Rewrite the header and body rows of each table, located by its delimiter row. */
function protectTableRowsInRegion(region: string): string {
  const lines = region.split('\n');
  const parts = lines.map((line) => splitContainerPrefix(stripCarriageReturn(line)));
  const isTableRow = new Array<boolean>(lines.length).fill(false);

  for (let index = 1; index < lines.length; index++) {
    const delimiter = parts[index]!;
    // Without a pipe this is a thematic break, not a delimiter row.
    if (!delimiter.content.includes('|') || !TABLE_DELIMITER_ROW.test(delimiter.content)) continue;

    // Rows belong to the same table only at the same container depth. Skipping
    // mismatched ones keeps an unrelated `> | --- |` elsewhere in the document
    // from dragging its neighbours into a needless rewrite.
    const header = parts[index - 1]!;
    if (isBlank(header.content) || header.depth !== delimiter.depth) continue;

    isTableRow[index - 1] = true;
    for (let body = index + 1; body < lines.length; body++) {
      const row = parts[body]!;
      if (isBlank(row.content) || row.depth !== delimiter.depth) break;
      isTableRow[body] = true;
    }
  }

  return lines
    .map((line, index) => {
      if (!isTableRow[index]) return line;
      const { prefix } = parts[index]!;
      return prefix + protectPipesInRow(line.slice(prefix.length));
    })
    .join('\n');
}

export function protectMathPipes(source: string): string {
  if (!source.includes('$') || !source.includes('|')) return source;
  // With an authored placeholder present, restoration could not tell it from
  // one of ours. Declining costs this document the fix, nothing more.
  if (source.includes(MATH_PIPE_PLACEHOLDER)) return source;
  return mapRegionsOutsideFences(source, protectTableRowsInRegion);
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
 * would turn an authored `&#xE000;` into a `|`. `html` is included because its
 * value is still unparsed at this stage; `code` because an indented block can
 * look enough like a table to be rewritten. `inlineCode` is absent: the scanner
 * skips code spans, so a placeholder never reaches one.
 */
const VERBATIM_NODE_TYPES = new Set(['math', 'inlineMath', 'code', 'html']);

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
