import { beforeEach, describe, expect, it, vi } from 'vitest';

// One queue for both statements the resolver can issue: the candidate lookup,
// then (only when a locale is given) the published-translation lookup.
const results = vi.hoisted(() => ({ queue: [] as unknown[][] }));
const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({ from: () => ({ where: async () => results.queue.shift() ?? [] }) })),
}));

vi.mock('@/server/db', () => ({ db: dbMock }));

import {
  createStaticWikiLinkResolver,
  createWikiLinkResolver,
  renderPageMarkdown,
  type WikiLinkExecutor,
} from './wiki-links';

const space = { id: 'space-id', kind: 'generated' as const, routePrefix: 'generated' };

describe('createWikiLinkResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    results.queue = [[
      { id: 'multi-registry-id', path: 'knowledge/ops/multi-registry', slug: 'knowledge/ops/multi-registry' },
      { id: 'docker-mirror-id', path: 'knowledge/ops/docker-mirror', slug: 'knowledge/ops/docker-mirror' },
    ]];
  });

  it('resolves a partial target to the page canonical URL inside its space', async () => {
    const resolve = await createWikiLinkResolver(space, 'See [[ops/multi-registry]].');
    expect(resolve({ target: 'ops/multi-registry', hash: '', label: 'ops/multi-registry' })).toBe(
      '/generated/knowledge/ops/multi-registry',
    );
  });

  it('keeps a heading fragment on the resolved address', async () => {
    const resolve = await createWikiLinkResolver(space, '[[ops/multi-registry#setup]]');
    expect(resolve({ target: 'ops/multi-registry', hash: '#setup', label: 'x' })).toBe(
      '/generated/knowledge/ops/multi-registry#setup',
    );
  });

  it('still links an unresolved target, addressed inside the space as written', async () => {
    const resolve = await createWikiLinkResolver(space, '[[ops/nowhere]]');
    expect(resolve({ target: 'ops/nowhere', hash: '', label: 'ops/nowhere' })).toBe(
      '/generated/ops/nowhere',
    );
  });

  it('queries nothing for a document without wikilinks', async () => {
    await createWikiLinkResolver(space, 'Plain [text](/elsewhere) only.');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('addresses a target as its translation when the render is for one', async () => {
    results.queue.push([{ sourcePageId: 'multi-registry-id' }]);
    const resolve = await createWikiLinkResolver(space, '[[ops/multi-registry]]', { locale: 'zh' });
    expect(resolve({ target: 'ops/multi-registry', hash: '', label: 'x' })).toBe(
      '/generated/zh/knowledge/ops/multi-registry',
    );
  });

  it('falls back to the original when the target has no published translation', async () => {
    results.queue.push([]);
    const resolve = await createWikiLinkResolver(space, '[[ops/multi-registry]]', { locale: 'zh' });
    expect(resolve({ target: 'ops/multi-registry', hash: '', label: 'x' })).toBe(
      '/generated/knowledge/ops/multi-registry',
    );
  });

  it('does not look for translations when no locale is given', async () => {
    await createWikiLinkResolver(space, '[[ops/multi-registry]]');
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('resolves on the caller transaction when one is supplied', async () => {
    const select = vi.fn(() => ({
      from: () => ({ where: async () => [{ id: 'in-flight-id', path: 'in-flight', slug: 'in-flight' }] }),
    }));
    const tx = { select } as unknown as WikiLinkExecutor;
    const resolve = await createWikiLinkResolver(space, '[[in-flight]]', { executor: tx });

    expect(select).toHaveBeenCalled();
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(resolve({ target: 'in-flight', hash: '', label: 'in-flight' })).toBe(
      '/generated/in-flight',
    );
  });

  it('renders a page with its wikilinks resolved', async () => {
    const { html } = await renderPageMarkdown(space, '补充: [[ops/multi-registry]]');
    expect(html).toContain('<a href="/generated/knowledge/ops/multi-registry">ops/multi-registry</a>');
  });
});

describe('createStaticWikiLinkResolver', () => {
  it('addresses a resolved target by tree path, for the artifact link rewriter', () => {
    const resolve = createStaticWikiLinkResolver([{ path: 'guides/install', slug: 'setup' }]);
    expect(resolve({ target: 'install', hash: '', label: 'install' })).toBe('/guides/install');
    expect(resolve({ target: 'missing', hash: '', label: 'missing' })).toBe('/missing');
  });
});
