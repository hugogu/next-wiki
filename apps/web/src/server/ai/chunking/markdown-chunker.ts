import { createHash } from 'node:crypto';

export const CHUNKER_VERSION = 'markdown-v2';

/**
 * Bytes below which a section cannot stand alone as a retrieval unit.
 *
 * Every section used to become at least one chunk, however short. A captured
 * conversation starts with `## Question` followed by the question itself, which
 * produced a 22-byte chunk reading exactly `Question\nIntroduce LLM` — an
 * embedding of the question and nothing else. Asking the same question again
 * scored it at cosine 1.0, so three such chunks took the top three retrieval
 * slots while carrying no information that could answer anything. The same
 * shape occurs in ordinary pages wherever a heading is followed by one short
 * line.
 *
 * Sections under this size are folded into the neighbouring chunk instead,
 * keeping their heading inline so nothing is lost.
 */
const MINIMUM_SECTION_BYTES = 240;

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

type Section = { headings: string[]; text: string };

/**
 * Fold sections too small to stand alone into the next one that is not.
 *
 * A small section's own heading travels with its text so the merged chunk still
 * reads as the document did — `Question` stays attached to the question it
 * labels. A trailing remainder joins the previous chunk rather than becoming
 * the stub this exists to prevent; a document that is entirely below the floor
 * is emitted as-is, because a short page is legitimately a short chunk.
 */
function coalesceSmallSections(sections: Section[], minimumBytes: number): Section[] {
  const coalesced: Section[] = [];
  let pending = '';
  for (const section of sections) {
    const own = section.headings.length
      ? `${section.headings.at(-1)}\n${section.text}`
      : section.text;
    const body = pending ? `${pending}\n${own}` : own;
    if (Buffer.byteLength(body) < minimumBytes) {
      pending = body;
      continue;
    }
    coalesced.push({
      headings: section.headings,
      text: pending ? `${pending}\n${section.text}` : section.text,
    });
    pending = '';
  }
  if (!pending) return coalesced;
  const last = coalesced.at(-1);
  if (last) last.text = `${last.text}\n${pending}`;
  else coalesced.push({ headings: sections[0]?.headings ?? [], text: pending });
  return coalesced;
}

export function chunkMarkdown(
  markdown: string,
  revisionHash: string,
  options: { maximumBytes?: number; overlapBytes?: number; minimumBytes?: number } = {},
): KnowledgeChunk[] {
  const maximumBytes = options.maximumBytes ?? 2_400;
  const overlapBytes = Math.min(options.overlapBytes ?? 240, Math.floor(maximumBytes / 3));
  const minimumBytes = Math.min(options.minimumBytes ?? MINIMUM_SECTION_BYTES, maximumBytes);
  const headings: string[] = [];
  const sections: Section[] = [];
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
  for (const section of coalesceSmallSections(sections, minimumBytes)) {
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
