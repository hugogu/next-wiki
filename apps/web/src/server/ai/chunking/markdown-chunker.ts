import { createHash } from 'node:crypto';

export const CHUNKER_VERSION = 'markdown-v1';

export type KnowledgeChunk = {
  chunkIndex: number;
  headingPath: string[];
  contentText: string;
  contentHash: string;
  byteCount: number;
};

function normalizeLine(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim();
}

function splitByBytes(text: string, maximumBytes: number): string[] {
  if (Buffer.byteLength(text) <= maximumBytes) return [text];
  const result: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && Buffer.byteLength(candidate) > maximumBytes) {
      result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) result.push(current);
  return result;
}

export function chunkMarkdown(
  markdown: string,
  revisionHash: string,
  options: { maximumBytes?: number; overlapBytes?: number } = {},
): KnowledgeChunk[] {
  const maximumBytes = options.maximumBytes ?? 2_400;
  const overlapBytes = Math.min(options.overlapBytes ?? 240, Math.floor(maximumBytes / 3));
  const headings: string[] = [];
  const sections: Array<{ headings: string[]; text: string }> = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text) sections.push({ headings: [...headings], text });
    current = [];
  };

  let inFence = false;
  for (const rawLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(rawLine)) {
      inFence = !inFence;
      const language = rawLine.replace(/^\s*```/, '').trim();
      if (language) current.push(`Code (${language})`);
      continue;
    }
    const heading = !inFence ? rawLine.match(/^(#{1,6})\s+(.+)$/) : null;
    if (heading) {
      flush();
      const level = heading[1]!.length;
      headings.splice(level - 1);
      headings[level - 1] = normalizeLine(heading[2]!);
      continue;
    }
    const line = normalizeLine(rawLine);
    if (line) current.push(line);
    else if (current.at(-1) !== '') current.push('');
  }
  flush();

  const chunks: KnowledgeChunk[] = [];
  let overlap = '';
  for (const section of sections) {
    const headingPrefix = section.headings.length ? `${section.headings.join(' / ')}\n` : '';
    for (const part of splitByBytes(section.text, maximumBytes - overlapBytes)) {
      const chunkIndex = chunks.length;
      const contentText = `${headingPrefix}${overlap ? `${overlap}\n` : ''}${part}`.trim();
      const contentHash = createHash('sha256')
        .update(`${CHUNKER_VERSION}\0${revisionHash}\0${chunkIndex}\0${contentText}`)
        .digest('hex');
      chunks.push({
        chunkIndex,
        headingPath: section.headings,
        contentText,
        contentHash,
        byteCount: Buffer.byteLength(contentText),
      });
      overlap = Buffer.from(part).subarray(Math.max(0, Buffer.byteLength(part) - overlapBytes)).toString().trim();
    }
  }
  return chunks;
}
