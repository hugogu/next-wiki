import { describe, expect, it } from 'vitest';
import { gitRepositoryIdentity, isSameGitRepository } from './content-storage';

/**
 * Deploy-key reuse between Git export and static site publishing depends on
 * both targeting one repository, because GitHub rejects a public key that is
 * already registered anywhere else.
 */

describe('gitRepositoryIdentity', () => {
  it('reduces every common remote form to the same identity', () => {
    const forms = [
      'git@github.com:owner/repo.git',
      'https://github.com/owner/repo.git',
      'https://github.com/owner/repo',
      'ssh://git@github.com/owner/repo.git',
      'https://github.com/owner/repo/',
    ];
    const identities = new Set(forms.map(gitRepositoryIdentity));
    expect(identities).toEqual(new Set(['github.com/owner/repo']));
  });

  it('is case-insensitive, matching how hosts treat these', () => {
    expect(gitRepositoryIdentity('git@GitHub.com:Owner/Repo.git')).toBe('github.com/owner/repo');
  });

  it('keeps distinct repositories distinct', () => {
    expect(gitRepositoryIdentity('git@github.com:owner/a.git')).not.toBe(
      gitRepositoryIdentity('git@github.com:owner/b.git'),
    );
  });

  it('distinguishes hosts', () => {
    expect(gitRepositoryIdentity('git@gitlab.com:owner/repo.git')).not.toBe(
      gitRepositoryIdentity('git@github.com:owner/repo.git'),
    );
  });

  it('returns null rather than guessing at unparseable input', () => {
    expect(gitRepositoryIdentity('')).toBeNull();
    expect(gitRepositoryIdentity('not a url')).toBeNull();
    expect(gitRepositoryIdentity('https://github.com/')).toBeNull();
  });
});

describe('isSameGitRepository', () => {
  it('matches the same repository across URL forms', () => {
    expect(
      isSameGitRepository('git@github.com:owner/repo.git', 'https://github.com/owner/repo'),
    ).toBe(true);
  });

  it('does not match different repositories', () => {
    expect(
      isSameGitRepository('git@github.com:owner/site.git', 'git@github.com:owner/backup.git'),
    ).toBe(false);
  });

  it('treats unparseable input as not matching, rather than as equal', () => {
    // Two unparseable remotes must not be considered the same repository just
    // because both failed to parse — that would offer key reuse where it cannot
    // work.
    expect(isSameGitRepository('garbage', 'garbage')).toBe(false);
  });
});
