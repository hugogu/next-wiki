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
 * Rewriting Markdown source by hand always risks disagreeing with the real
 * parser, and any disagreement would strand a placeholder in the output. Three
 * properties keep that from happening:
 *
 * 1. `protectMathPipes` bails out entirely if the source already contains the
 *    placeholder, so **every** placeholder downstream is one this module
 *    created from a `|`.
 * 2. Restoration is therefore unconditional and exhaustive — it does not try to
 *    re-identify "which placeholders were math", it just turns all of them back
 *    into `|` wherever they appear.
 * 3. Because the only rewrite performed is `|` → placeholder, the *sole*
 *    parse-level consequence is "this pipe does not split a table cell".
 *    A mis-identified span therefore degrades to a table that splits where it
 *    otherwise would not — never to a stray character in rendered output.
 *
 * The scanner below still mirrors micromark's tokenization closely so that (3)
 * stays a theoretical fallback rather than a routine occurrence.
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

/** Length of the run of `char` starting at `start`. */
function runLength(text: string, start: number, char: string): number {
  let end = start;
  while (end < text.length && text[end] === char) end++;
  return end - start;
}

/**
 * Index of the run of exactly `length` `char`s that closes a span opened at
 * `from`, or -1 if the span is never closed.
 *
 * Mirrors micromark on two points verified against remark-math's actual output:
 * a delimiter run only closes a run of the same length (`$$a$$$` is not math),
 * and a backslash does *not* escape the closing delimiter (`$a \$ b$` parses as
 * math with the body `a \`). A blank line ends the enclosing block, so nothing
 * past one can close the span.
 */
function findClosingRun(text: string, from: number, char: string, length: number): number {
  let index = from;
  while (index < text.length) {
    const current = text[index];
    if (current === '\n') {
      let next = index + 1;
      while (next < text.length && (text[next] === ' ' || text[next] === '\t')) next++;
      if (next >= text.length || text[next] === '\n') return -1;
      index = next;
      continue;
    }
    if (current === char) {
      const run = runLength(text, index, char);
      if (run === length) return index;
      index += run;
      continue;
    }
    index++;
  }
  return -1;
}

function protectPipesInRegion(region: string): string {
  let out = '';
  let index = 0;

  while (index < region.length) {
    const char = region[index]!;

    // A character escape consumes both characters, so `\$` and `` \` `` never
    // open a span — this is what makes `\$|x|$` correctly parse as plain text
    // with pipes that still split table cells.
    if (char === '\\') {
      out += region.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === '`' || char === '$') {
      const run = runLength(region, index, char);
      const close = findClosingRun(region, index + run, char, run);

      if (close === -1) {
        // Never closed, so the run is literal text rather than a delimiter.
        out += region.slice(index, index + run);
        index += run;
        continue;
      }

      const body = region.slice(index + run, close);
      out += region.slice(index, index + run);
      // Code spans are skipped, not protected: GFM splits table cells before
      // inline parsing, so a pipe inside a code span genuinely does split the
      // cell. Protecting it would change existing behaviour.
      out += char === '$' ? body.replaceAll('|', MATH_PIPE_PLACEHOLDER) : body;
      out += region.slice(close, close + run);
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
  // Without this guard, restoration could not tell a placeholder this module
  // inserted from one the author typed, and would rewrite the author's
  // character into a `|` it never was. Skipping protection only costs the
  // table-splitting fix for that one document.
  if (source.includes(MATH_PIPE_PLACEHOLDER)) return source;
  return mapRegionsOutsideFences(source, protectPipesInRegion);
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
 * Restore every placeholder in the tree, regardless of node type. See the
 * module comment: each one is provably a `|` this module replaced, so this
 * needs no knowledge of which spans the parser ultimately treated as math.
 */
export function restoreMathPipes(tree: Root) {
  visit(tree, (node) => {
    const candidate = node as { value?: unknown; data?: { hChildren?: unknown } };
    if (typeof candidate.value === 'string') {
      candidate.value = candidate.value.replaceAll(MATH_PIPE_PLACEHOLDER, '|');
    }
    restorePipesInHastChildren(candidate.data?.hChildren);
  });
}

/**
 * Final backstop, for placeholders that reached the HTML through a field the
 * mdast pass does not walk (a URL, a title, raw embedded HTML). Only sound when
 * protection actually ran — see the call site in `renderMarkdown`.
 */
export function restoreMathPipesInHtml(html: string): string {
  return html.replaceAll(MATH_PIPE_PLACEHOLDER, '|');
}
