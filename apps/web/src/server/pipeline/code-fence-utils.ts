/** Matches a fenced code block's opening line (``` or ~~~), capturing the fence marker. */
export const CODE_FENCE = /^([ \t]*)(`{3,}|~{3,})/;

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
export function mapRegionsOutsideFences(source: string, transform: (region: string) => string): string {
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
