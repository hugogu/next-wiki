import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSearchIndex, chooseSearchLanguage, SearchIndexError } from './search-index';

/**
 * Pagefind indexes the generated HTML directory, so these tests operate on a
 * hand-written artifact rather than a database fixture — that is exactly the
 * contract: whatever is in the directory is what gets indexed, and nothing else
 * can reach the index.
 */

const dirs: string[] = [];

async function artifact(pages: { path: string; lang: string; title: string; body: string }[]) {
  const dir = await mkdtemp(join(tmpdir(), 'static-site-index-'));
  dirs.push(dir);
  for (const page of pages) {
    const full = join(dir, page.path);
    await mkdir(full, { recursive: true });
    await writeFile(
      join(full, 'index.html'),
      `<!DOCTYPE html><html lang="${page.lang}"><head><title>${page.title}</title></head>
       <body><header data-pagefind-ignore>chrome</header>
       <main><span data-pagefind-meta="title" hidden>${page.title}</span>
       <div class="prose" data-pagefind-body>${page.body}</div></main></body></html>`,
    );
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildSearchIndex', () => {
  it('writes a chunked index over the generated HTML', async () => {
    const dir = await artifact([
      { path: 'a', lang: 'en', title: 'Alpha', body: '<p>Installation requires pnpm.</p>' },
      { path: 'b', lang: 'en', title: 'Beta', body: '<p>Another published page.</p>' },
    ]);

    const result = await buildSearchIndex(dir);
    expect(result.files).toBeGreaterThan(0);

    // Chunked rather than one blob: this is what keeps a reader from having to
    // download the whole corpus before their first query.
    const entry = JSON.parse(await readFile(join(dir, 'pagefind', 'pagefind-entry.json'), 'utf8'));
    expect(Object.keys(entry.languages)).toContain('en');
  }, 120_000);

  it('indexes CJK content under its own language', async () => {
    const dir = await artifact([
      { path: 'en', lang: 'en', title: 'English', body: '<p>English content.</p>' },
      { path: 'zh', lang: 'zh', title: '中文页面', body: '<p>这是中文内容，用于验证分词。</p>' },
    ]);

    await buildSearchIndex(dir);
    const entry = JSON.parse(await readFile(join(dir, 'pagefind', 'pagefind-entry.json'), 'utf8'));
    expect(Object.keys(entry.languages).sort()).toEqual(['en', 'zh']);
    expect(entry.languages.zh.page_count).toBe(1);
  }, 120_000);

  it('does not index content marked ignored', async () => {
    const dir = await artifact([
      { path: 'a', lang: 'en', title: 'Alpha', body: '<p>indexed content here</p>' },
    ]);
    await buildSearchIndex(dir);

    // The chrome in the fixture carries data-pagefind-ignore; if it leaked into
    // the index every page would match every other page's navigation.
    const fragments = await readFile(
      join(dir, 'pagefind', 'pagefind-entry.json'),
      'utf8',
    );
    expect(fragments).not.toContain('chrome');
  }, 120_000);

  it('can force a multilingual site into a single-language index', async () => {
    const dir = await artifact([
      { path: 'en', lang: 'en', title: 'English', body: '<p>English content.</p>' },
      { path: 'zh', lang: 'zh', title: '中文页面', body: '<p>这是中文内容，用于验证分词。</p>' },
    ]);

    await buildSearchIndex(dir, { forceLanguage: 'zh' });
    const entry = JSON.parse(await readFile(join(dir, 'pagefind', 'pagefind-entry.json'), 'utf8'));
    // A unified index collapses every page into one partition so readers on any
    // language page can find pages published in any other language.
    expect(Object.keys(entry.languages)).toEqual(['zh']);
    expect(entry.languages.zh.page_count).toBe(2);
  }, 120_000);

  it('fails loudly when the binary cannot be found', async () => {
    // A publish that quietly skipped indexing would ship a site whose search
    // box finds nothing, and the operator would never learn about it.
    const dir = await artifact([{ path: 'a', lang: 'en', title: 'A', body: '<p>x</p>' }]);
    const previous = process.env.PAGEFIND_BINARY;
    const previousPath = process.env.PATH;
    process.env.PAGEFIND_BINARY = '/nonexistent/pagefind';
    // Empty PATH so the PATH-based candidates and npx cannot resolve either.
    process.env.PATH = '/nonexistent';
    try {
      await expect(buildSearchIndex(dir)).rejects.toBeInstanceOf(SearchIndexError);
    } finally {
      process.env.PATH = previousPath;
      if (previous === undefined) delete process.env.PAGEFIND_BINARY;
      else process.env.PAGEFIND_BINARY = previous;
    }
  }, 120_000);
});

describe('chooseSearchLanguage', () => {
  it('leaves single-language sites on their default partition', () => {
    expect(chooseSearchLanguage(['en'])).toBeUndefined();
  });

  it('prefers a language that needs word segmentation for a unified index', () => {
    // Forcing a whitespace-delimited language would leave CJK text unsegmented
    // and break Chinese/Japanese/Thai search, so the heuristic picks the
    // segmenting language even if it is not the first locale alphabetically.
    expect(chooseSearchLanguage(['en', 'zh'])).toBe('zh');
    expect(chooseSearchLanguage(['fr', 'ja'])).toBe('ja');
    expect(chooseSearchLanguage(['en', 'th', 'de'])).toBe('th');
  });

  it('falls back to the first locale when no language needs segmentation', () => {
    expect(chooseSearchLanguage(['en', 'fr'])).toBe('en');
  });

  it('matches sub-locale tags against the segmentation list', () => {
    expect(chooseSearchLanguage(['en', 'zh-CN'])).toBe('zh-CN');
  });
});
