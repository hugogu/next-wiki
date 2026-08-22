/**
 * Protect literal `|` characters inside math spans (`$…$`, `$$…$$`) from being
 * misread as GFM table-cell delimiters.
 *
 * remark-gfm splits a table row into cells on every unescaped `|` at the block
 * level, before any inline parsing happens — so it has no notion of `$…$` being
 * math. A formula containing an absolute value (`$|x| < 1/2$`) inside a table
 * cell gets sliced apart mid-formula and the rest of the row is dropped.
 *
 * `protectMathPipes` swaps those `|` for a placeholder before parsing (so cell
 * splitting steps over them); `restoreMathPipes` puts them back in the parsed
 * tree, before KaTeX or the HTML serializer ever sees one.
 *
 * ## Why this is safe
 *
 * Rewriting Markdown source by hand risks disagreeing with the real parser, and
 * a disagreement means a placeholder ends up somewhere restoration does not
 * look. Three properties bound that:
 *
 * 1. **Only table rows are rewritten.** A `|` anywhere else does not split a
 *    cell, so there is nothing to protect and no reason to touch it. This is
 *    what keeps the module from needing an exception for every construct that
 *    can hold a `$…$` — a link destination, an image title, and so on.
 * 2. `protectMathPipes` refuses to run at all if the source already contains a
 *    literal placeholder, and the caller only restores when it did run, so an
 *    author's own placeholder is never rewritten.
 * 3. Restoration is confined to node types whose content is verbatim. Character
 *    references such as `&#xE000;` are decoded *after* this module has scanned
 *    the source, so a global restore would turn an authored `&#xE000;` into a
 *    `|`. Those decode only in text positions, which restoration skips.
 *
 * `renderMarkdown` additionally discards a protected render whose output still
 * contains a placeholder, falling back to the unprotected one — so even a
 * mis-scan can only cost a document the table fix, never show a stray character.
 */

import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { mapRegionsOutsideFences } from './code-fence-utils';

// U+E000, the first Private Use Area codepoint — no keyboard produces it and no
// legitimate TeX needs it. A single character (rather than a longer sentinel)
// is deliberate: it cannot be tokenized apart by the parser mid-flight, so it
// always round-trips intact. Spelled via `fromCharCode` so the character stays
// visible in source and in diffs instead of being an invisible byte.
const MATH_PIPE_PLACEHOLDER = String.fromCharCode(0xe000);

/**
 * A GFM delimiter row — the `| --- | --- |` line that turns the line above it
 * into a table header. Being the one part of a table that cannot contain math,
 * it is a reliable anchor for finding the rows that can.
 */
const TABLE_DELIMITER_ROW = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/**
 * A bullet or ordered list marker. It appears only on an item's opening line —
 * continuation lines are indented instead — so a table that starts a list item
 * has `- >` on its first row and `  >` on the rest.
 */
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+/;

const stripCarriageReturn = (line: string) => (line.endsWith('\r') ? line.slice(0, -1) : line);

const isBlank = (line: string) => line.trim() === '';

type LineParts = { prefix: string; content: string; depth: number };

/**
 * Split off the prefix that container blocks repeat on every line they enclose,
 * so a nested table's rows look like rows again. CommonMark has exactly two
 * container blocks — block quotes and list items — so consuming indentation,
 * `>` markers and list markers covers all of them; everything else is a leaf
 * block that cannot wrap a table.
 */
function splitContainerPrefix(line: string): LineParts {
  let index = 0;
  // Rows only belong to the same table if they sit at the same quote depth.
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

/** Length of the run of `char` starting at `start`. */
function runLength(text: string, start: number, char: string): number {
  let end = start;
  while (end < text.length && text[end] === char) end++;
  return end - start;
}

/**
 * Index of the run of exactly `length` `char`s that closes a span opened at
 * `from`, or -1 if the span is never closed within the line.
 *
 * Mirrors micromark on two points verified against remark-math's actual output:
 * a delimiter run only closes a run of the same length (`$$a$$$` is not math),
 * and a backslash does *not* escape the closing delimiter (`$a \$ b$` parses as
 * math with the body `a \`). A table row is a single line by definition, so a
 * span that does not close on this line cannot be one that affects this row.
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

    // A character escape consumes both characters, so `\$` and `` \` `` never
    // open a span — this is what makes `\$|x|$` correctly stay plain text whose
    // pipes still split the cell.
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
      // parsing, so a pipe inside a code span genuinely does split the cell.
      // Protecting it would change existing behaviour.
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

/**
 * Rewrite only the header and body rows of GFM tables, located by their
 * delimiter row. The delimiter row itself is left alone — it cannot contain
 * math — and so is every line that is not part of a table.
 */
function protectTableRowsInRegion(region: string): string {
  const lines = region.split('\n');
  const parts = lines.map((line) => splitContainerPrefix(stripCarriageReturn(line)));
  const isTableRow = new Array<boolean>(lines.length).fill(false);

  for (let index = 1; index < lines.length; index++) {
    const delimiter = parts[index]!;
    // A delimiter row needs a pipe; without one this is a thematic break.
    if (!delimiter.content.includes('|') || !TABLE_DELIMITER_ROW.test(delimiter.content)) continue;

    // The header is the line directly above, inside the same container.
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
      // Protect only the row itself; the container prefix is passed through so
      // the line still belongs to its blockquote or list item.
      const { prefix } = parts[index]!;
      return prefix + protectPipesInRow(line.slice(prefix.length));
    })
    .join('\n');
}

export function protectMathPipes(source: string): string {
  if (!source.includes('$') || !source.includes('|')) return source;
  // Without this guard, restoration could not tell a placeholder this module
  // inserted from one the author typed, and would rewrite the author's
  // character into a `|` it never was. Skipping protection only costs the
  // table-splitting fix for that one document.
  if (source.includes(MATH_PIPE_PLACEHOLDER)) return source;
  return mapRegionsOutsideFences(source, protectTableRowsInRegion);
}

type HastLike = { value?: unknown; children?: HastLike[] };

/**
 * `mdast-util-math` bakes the raw TeX into `node.data.hChildren` at parse time
 * — that is what `remark-rehype` renders from, not `node.value` — so the
 * placeholder has to be restored there too, or it survives to KaTeX.
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
 * Node types whose value is verbatim source text. Markdown character references
 * are decoded only in text positions, never in these — an `html` node still
 * holds the literal `&#xE000;` at this stage, since rehype-raw does not parse it
 * until later — so a placeholder found here cannot have come from an author
 * writing an entity. It is one this module inserted.
 *
 * `text` is deliberately absent for exactly that reason. `html` is present
 * because a table cell may contain raw HTML whose attribute holds a `$…$`.
 */
const VERBATIM_NODE_TYPES = new Set(['math', 'inlineMath', 'code', 'inlineCode', 'html']);

/**
 * Turn this module's placeholders back into pipes.
 *
 * `enabled` must be false whenever `protectMathPipes` declined to run, so that a
 * document containing an author's own literal placeholder is left alone; see the
 * call site in `renderMarkdown`.
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

/** Whether rendered output still carries a placeholder that restoration missed. */
export function hasUnrestoredPlaceholder(html: string): boolean {
  return html.includes(MATH_PIPE_PLACEHOLDER);
}
