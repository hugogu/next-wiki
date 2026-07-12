import { describe, expect, it } from 'vitest';
import { readEditorMetadata, writeEditorMetadata } from './page-frontmatter';

const authoredFrontmatter = `---
title: 用官方 actions/runner 跑自托管 GitHub Actions：Docker 化踩坑实录
date: 2026-07-10
tags: [github-actions, docker, self-hosted-runner, devops]
summary: 把老掉牙的 myoung34/github-runner 换掉，用官方 actions/runner tarball 自己打包镜像。过程中撞上两个 restart loop——一个关于 state 持久化，一个关于半残的 state 文件。
---

# 正文
`;

describe('editor frontmatter persistence', () => {
  it('returns manually authored Markdown byte-for-byte when properties were not changed', () => {
    const baseline = { title: '旧标题', metadata: readEditorMetadata('# 正文\n') };

    expect(writeEditorMetadata(authoredFrontmatter, '旧标题', baseline.metadata, baseline))
      .toBe(authoredFrontmatter);
  });

  it('does not reserialize existing frontmatter when all controls are unchanged', () => {
    const metadata = readEditorMetadata(authoredFrontmatter);
    const baseline = { title: '用官方 actions/runner 跑自托管 GitHub Actions：Docker 化踩坑实录', metadata };

    expect(writeEditorMetadata(authoredFrontmatter, baseline.title, metadata, baseline))
      .toBe(authoredFrontmatter);
  });

  it('updates only explicitly changed properties using the current editor source as truth', () => {
    const initialSource = '---\ntitle: Guide\ntags: [old]\nsummary: Before\n---\n\n# Body';
    const currentSource = '---\ntitle: Guide\ntags: [manual, docker]\nsummary: Before\nowner: docs\n---\n\n# Body';
    const baselineMetadata = readEditorMetadata(initialSource);
    const result = writeEditorMetadata(
      currentSource,
      'Guide',
      { ...baselineMetadata, summary: 'After' },
      { title: 'Guide', metadata: baselineMetadata },
    );

    expect(result).toContain('tags:\n  - manual\n  - docker');
    expect(result).toContain('summary: After');
    expect(result).toContain('owner: docs');
  });
});
