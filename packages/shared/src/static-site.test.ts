import { describe, expect, it } from 'vitest';
import { githubPagesDefaultUrl, staticSiteBasePath, staticSiteCustomDomain } from './static-site';

/**
 * A base URL that does not match how the host actually serves the site is the
 * single most damaging misconfiguration this feature has: every link, image,
 * and stylesheet resolves against the wrong root, so the site looks broken
 * while the publish reports success.
 */

describe('githubPagesDefaultUrl', () => {
  it('derives a project site under its repository path', () => {
    expect(githubPagesDefaultUrl('git@github.com:hugogu/wiki-pages.git')).toBe(
      'https://hugogu.github.io/wiki-pages/',
    );
  });

  it('derives a user site at the domain root', () => {
    expect(githubPagesDefaultUrl('git@github.com:hugogu/hugogu.github.io.git')).toBe(
      'https://hugogu.github.io/',
    );
  });

  it('accepts either remote form', () => {
    expect(githubPagesDefaultUrl('https://github.com/owner/repo')).toBe(
      githubPagesDefaultUrl('git@github.com:owner/repo.git'),
    );
  });

  it('returns null for a non-GitHub remote', () => {
    expect(githubPagesDefaultUrl('git@gitlab.com:owner/repo.git')).toBeNull();
  });
});

describe('staticSiteCustomDomain', () => {
  it('claims a custom domain so a publish does not clear it', () => {
    // A publish replaces the branch wholesale; without this the CNAME file
    // GitHub wrote disappears and the domain stops resolving to the site.
    expect(staticSiteCustomDomain('https://static-kb.example.cn/')).toBe('static-kb.example.cn');
  });

  it('claims nothing when served from the host default domain', () => {
    expect(staticSiteCustomDomain('https://owner.github.io/repo/')).toBeNull();
    expect(staticSiteCustomDomain('https://owner.github.io/')).toBeNull();
  });

  it('ignores a local preview address', () => {
    expect(staticSiteCustomDomain('http://localhost:4180/')).toBeNull();
  });
});

describe('staticSiteBasePath', () => {
  it('distinguishes a project sub-path from a domain root', () => {
    // These produce entirely different artifacts; confusing them is what makes
    // every link on the site break.
    expect(staticSiteBasePath('https://hugogu.github.io/wiki-pages/')).toBe('/wiki-pages/');
    expect(staticSiteBasePath('https://static-kb.example.cn/')).toBe('/');
  });
});
