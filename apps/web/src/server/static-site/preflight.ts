import type { SnapshotManifest } from './snapshot';

/**
 * Check a finished snapshot against the host's limits before delivery.
 *
 * Failing here leaves the previously published site intact. Pushing an
 * over-limit artifact instead gets it rejected by the host after the commit
 * has already replaced the branch, which is the state FR-031 forbids.
 *
 * Defaults follow GitHub Pages: a soft 1 GB site limit and a 100 MB per-file
 * hard limit. They are parameters rather than constants because the artifact is
 * host-neutral by design.
 */

export const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;

export class SnapshotTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotTooLargeError';
  }
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function preflightSnapshot(
  manifest: SnapshotManifest,
  limits: { maxTotalBytes?: number; maxFileBytes?: number } = {},
): void {
  const maxTotal = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxFile = limits.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  if (manifest.largestFileBytes > maxFile) {
    throw new SnapshotTooLargeError(
      `A single file in the snapshot is ${formatMegabytes(
        manifest.largestFileBytes,
      )}, above the ${formatMegabytes(maxFile)} per-file limit. Reduce or remove the largest asset and publish again.`,
    );
  }

  if (manifest.totalBytes > maxTotal) {
    throw new SnapshotTooLargeError(
      `The snapshot is ${formatMegabytes(manifest.totalBytes)}, above the ${formatMegabytes(
        maxTotal,
      )} site limit. The previously published site is unchanged.`,
    );
  }
}
