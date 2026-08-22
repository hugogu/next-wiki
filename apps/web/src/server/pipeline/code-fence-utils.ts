/** Matches a fenced code block's opening line (\`\`\` or ~~~), capturing the fence marker. */
export const CODE_FENCE = /^([ \t]*)(`{3,}|~{3,})/;

/**
 * Run `transform` over every line of `source` that sits outside a fenced code
 * block, leaving fenced lines (including the fence markers themselves)
 * untouched. Shared by preprocessing steps that rewrite inline Markdown/TeX
 * syntax before it reaches remark, so they never mangle a literal example
 * inside a code fence.
 */
export function mapLinesOutsideFences(source: string, transform: (line: string) => string): string {
  let openFence: string | null = null;
  return source
    .split('\n')
    .map((line) => {
      if (openFence) {
        if (new RegExp(`^[ \\t]*${openFence[0]}{${openFence.length},}[ \\t]*$`).test(line)) {
          openFence = null;
        }
        return line;
      }
      const fence = CODE_FENCE.exec(line);
      if (fence) {
        openFence = fence[2]!;
        return line;
      }
      return transform(line);
    })
    .join('\n');
}
