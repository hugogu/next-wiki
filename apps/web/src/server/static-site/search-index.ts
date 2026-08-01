import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Build the published site's search index with Pagefind.
 *
 * Pagefind indexes the generated HTML directory, so the index inherits the
 * content filter structurally: the artifact only ever contains publishable
 * pages, therefore the index only ever contains publishable pages. There is no
 * second query path that could put an excluded page into search results.
 *
 * The index is chunked — a reader's first query fetches a small entry point and
 * then only the shards that query touches, rather than the whole corpus
 * (FR-023). `pagefind_extended` segments CJK text at index time, and the
 * browser segments the query side, which is what makes Chinese searchable
 * without manual word delimiting (FR-022).
 */

const INDEX_TIMEOUT_MS = 10 * 60 * 1000;

export class SearchIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchIndexError';
  }
}

/**
 * Candidate ways to invoke Pagefind, in order.
 *
 * The runtime image installs `pagefind_extended` on PATH. A developer machine
 * usually has neither, so `npx` is the last resort — convenient locally, and
 * never reached in the image because the binary is found first.
 */
function candidates(): { command: string; leadingArgs: string[] }[] {
  const configured = process.env.PAGEFIND_BINARY;
  return [
    ...(configured ? [{ command: configured, leadingArgs: [] }] : []),
    { command: 'pagefind_extended', leadingArgs: [] },
    { command: 'pagefind', leadingArgs: [] },
    { command: 'npx', leadingArgs: ['--yes', 'pagefind'] },
  ];
}

async function runPagefind(siteDir: string): Promise<string> {
  const failures: string[] = [];

  for (const { command, leadingArgs } of candidates()) {
    try {
      const { stdout } = await execFileAsync(
        command,
        [...leadingArgs, '--site', siteDir],
        { timeout: INDEX_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      );
      return `${command}: ${stdout.trim().split('\n').at(-1) ?? 'done'}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${command}: ${message.split('\n')[0]}`);
    }
  }

  throw new SearchIndexError(
    `Could not build the search index. Pagefind is required to publish a searchable site; ` +
      `set PAGEFIND_BINARY if it lives somewhere unusual. Attempts:\n${failures.join('\n')}`,
  );
}

export type SearchIndexResult = {
  /** Files written under the artifact's reserved `pagefind/` prefix. */
  files: number;
  detail: string;
};

export async function buildSearchIndex(siteDir: string): Promise<SearchIndexResult> {
  const detail = await runPagefind(siteDir);

  // A run that reports success but produces no index would ship a site whose
  // search box silently returns nothing, which is worse than a failed publish
  // because the operator never learns about it.
  const indexDir = join(siteDir, 'pagefind');
  try {
    await access(indexDir);
  } catch {
    throw new SearchIndexError(
      'Pagefind reported success but wrote no index directory, so the published site would have a search box that finds nothing.',
    );
  }

  const files = (await readdir(indexDir, { recursive: true })).length;
  if (files === 0) {
    throw new SearchIndexError('Pagefind produced an empty index directory.');
  }

  return { files, detail };
}
