/** Raised when an engine exceeds its per-request budget; maps to `timed_out`. */
export class EngineDeadlineExceeded extends Error {
  constructor() {
    super('Search engine exceeded its request budget');
    this.name = 'EngineDeadlineExceeded';
  }
}

/**
 * Soft deadline: the losing promise is abandoned, not cancelled — acceptable
 * for bounded lexical queries whose cost is already index-limited.
 */
export async function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EngineDeadlineExceeded()), deadlineMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
