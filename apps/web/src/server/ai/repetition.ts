import type { TextGenerationEvent } from './types';

/**
 * Recognizes a model that has fallen into a repetition loop while streaming.
 *
 * A looping model keeps emitting the same sentence or paragraph — often with
 * one word changing each round ("... axis=-1 is used in pandas for
 * `DataFrame.groupby`? Not directly. Thus answer.") — until it exhausts its
 * output budget. The detector asks one question about the tail of a stream:
 * how much of the last N bytes is text that already appeared earlier in those
 * same N bytes? Only the tail window is considered, so a block copied from far
 * earlier in a long answer is not a loop.
 *
 * "Text that already appeared" means a byte covered by a 32-byte run that
 * occurred before in the window. Sizes are bytes, not characters, so Chinese
 * (3 bytes per character) and English cost roughly the same number of tokens
 * per window. The one word that changes in each round stays uncovered, which
 * is why a loop with a changing word scores about 0.9 rather than 1.0.
 *
 * Thresholds were measured, not guessed. Across this repo's Markdown specs,
 * TypeScript and JSON, ordinary text never exceeds ~0.75 on any window. Loops
 * reach 0.99+ when the repeated text is exact and 0.87–0.92 when one word
 * changes per round. Highly regular but legitimate data (a 200-entry YAML or
 * HTML list) overlaps the second group once it is 8 KB or longer; a loop never
 * ends while such data does, so longer windows trade latency for safety and
 * only the shortest window demands near-exact repetition.
 */

export type RepetitionTier = {
  /** Size of the trailing window to inspect, in bytes. */
  readonly windowBytes: number;
  /** Share (0–1) of the window that must be repeated text to count as a loop. */
  readonly minCoverage: number;
};

export const REPETITION_TIERS: readonly RepetitionTier[] = [
  // Exact repeats of a short phrase, or runs of one character.
  { windowBytes: 2_048, minCoverage: 0.985 },
  { windowBytes: 4_096, minCoverage: 0.93 },
  // A repeated sentence or paragraph with a changing word. The 16 KB window
  // keeps seeing loops whose cycle is a sizeable share of the 8 KB one.
  { windowBytes: 8_192, minCoverage: 0.86 },
  { windowBytes: 16_384, minCoverage: 0.86 },
];

const SHINGLE_BYTES = 32;
// Evaluating a window is linear in its size; once per KB keeps the cost
// negligible next to the model's own generation speed.
const CHECK_INTERVAL_BYTES = 1_024;

export type RepetitionFinding = {
  /** The trailing window that crossed its limit, in bytes. */
  windowBytes: number;
  /** Share (0–1) of that window made of text already seen earlier in it. */
  coverage: number;
  /** Bytes this stream had produced when the loop was recognized. */
  streamedBytes: number;
};

/** One byte per character, so string indexes are byte offsets. */
function toByteString(text: string): string {
  return Buffer.from(text, 'utf8').toString('latin1');
}

function repeatedCoverage(window: string): number {
  const seen = new Set<string>();
  let covered = 0;
  let coveredUntil = 0;
  for (let start = 0; start + SHINGLE_BYTES <= window.length; start += 1) {
    const run = window.slice(start, start + SHINGLE_BYTES);
    if (!seen.has(run)) {
      seen.add(run);
      continue;
    }
    // Overlapping repeated runs must not be counted twice.
    const end = start + SHINGLE_BYTES;
    covered += end - Math.max(start, coveredUntil);
    coveredUntil = end;
  }
  return covered / window.length;
}

/** Watches one text stream; feed it every chunk in order. */
export class RepetitionDetector {
  private history = '';
  private pending = '';
  private streamedBytes = 0;
  private readonly longestWindow: number;

  constructor(private readonly tiers: readonly RepetitionTier[] = REPETITION_TIERS) {
    this.longestWindow = Math.max(...tiers.map((tier) => tier.windowBytes));
  }

  /** Returns a finding once the stream's tail has degenerated into a loop. */
  push(text: string): RepetitionFinding | null {
    if (!text) return null;
    const bytes = toByteString(text);
    this.streamedBytes += bytes.length;
    this.pending += bytes;
    if (this.pending.length < CHECK_INTERVAL_BYTES) return null;

    this.history = (this.history + this.pending).slice(-this.longestWindow);
    this.pending = '';
    for (const tier of this.tiers) {
      if (this.history.length < tier.windowBytes) continue;
      const coverage = repeatedCoverage(this.history.slice(-tier.windowBytes));
      if (coverage >= tier.minCoverage) {
        return { windowBytes: tier.windowBytes, coverage, streamedBytes: this.streamedBytes };
      }
    }
    return null;
  }
}

/** Which part of a model response looped. */
export type RepetitionChannel = 'reasoning' | 'content';

/**
 * One detector per output channel. Reasoning and content are tracked apart so
 * a model that thinks, answers, then thinks again is never measured as one
 * blended stream.
 */
export function createRepetitionGuard() {
  const detectors: Record<RepetitionChannel, RepetitionDetector> = {
    reasoning: new RepetitionDetector(),
    content: new RepetitionDetector(),
  };
  return {
    observe(event: TextGenerationEvent): (RepetitionFinding & { channel: RepetitionChannel }) | null {
      if (event.type !== 'delta' && event.type !== 'reasoning_delta') return null;
      const channel: RepetitionChannel = event.type === 'delta' ? 'content' : 'reasoning';
      const finding = detectors[channel].push(event.text);
      return finding ? { channel, ...finding } : null;
    },
  };
}
