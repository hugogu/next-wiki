import {
  buildInstructionFile,
  classifyFile,
  contentTypeFor,
  isInsidePackage,
  isViewable,
  parseInstructionFile,
  safeRelativePath,
} from './package';

/**
 * Skill package parsing (028, FR-012, FR-013a, FR-029).
 *
 * The validation table exists so a rejected package tells an administrator
 * which of five things is wrong with it. Each case here pins one of those
 * answers.
 */

const valid = [
  '---',
  'name: wiki-linker',
  'description: Turn keywords into links.',
  '---',
  '',
  '# Wiki Linker',
].join('\n');

describe('parseInstructionFile', () => {
  it('accepts a well-formed instruction file and keeps the body', () => {
    const result = parseInstructionFile(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('wiki-linker');
    expect(result.value.description).toBe('Turn keywords into links.');
    expect(result.value.body).toContain('# Wiki Linker');
    expect(result.value.body).not.toContain('name:');
  });

  it('rejects a file with no frontmatter block', () => {
    const result = parseInstructionFile('# Just a heading');
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalid_frontmatter' } });
    if (result.ok) return;
    expect(result.error.detail).toContain('frontmatter');
  });

  it('rejects unparseable YAML', () => {
    const result = parseInstructionFile('---\nname: [unclosed\n---\n');
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalid_frontmatter' } });
  });

  it('rejects frontmatter that is not a mapping', () => {
    const result = parseInstructionFile('---\n- one\n- two\n---\n');
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalid_frontmatter' } });
  });

  it.each([
    ['missing', '---\ndescription: x\n---\n'],
    ['uppercase', '---\nname: Wiki-Linker\ndescription: x\n---\n'],
    ['underscored', '---\nname: wiki_linker\ndescription: x\n---\n'],
    ['double hyphen', '---\nname: wiki--linker\ndescription: x\n---\n'],
    ['trailing hyphen', '---\nname: wiki-\ndescription: x\n---\n'],
  ])('rejects a %s name', (_label, source) => {
    const result = parseInstructionFile(source);
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalid_frontmatter' } });
    if (result.ok) return;
    expect(result.error.detail).toContain('name');
  });

  it.each([
    ['missing', '---\nname: ok-skill\n---\n'],
    ['blank', '---\nname: ok-skill\ndescription: "   "\n---\n'],
  ])('rejects a %s description', (_label, source) => {
    const result = parseInstructionFile(source);
    expect(result).toMatchObject({ ok: false, error: { reason: 'invalid_frontmatter' } });
    if (result.ok) return;
    expect(result.error.detail).toContain('description');
  });

  it('round-trips through buildInstructionFile, including a description with a colon', () => {
    const built = buildInstructionFile({
      name: 'ok-skill',
      description: 'Use when: someone asks for X.',
      body: '# Heading',
    });
    const parsed = parseInstructionFile(built);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.description).toBe('Use when: someone asks for X.');
  });
});

describe('safeRelativePath', () => {
  it.each(['SKILL.md', 'reference/rules.md', 'scripts/nested/tool.py'])('accepts %s', (input) => {
    expect(safeRelativePath(input)).toBe(input);
  });

  it.each([
    '/etc/passwd',
    '../outside.md',
    'reference/../../outside.md',
    'reference\\windows.md',
    '',
    '..',
  ])('rejects %s', (input) => {
    expect(safeRelativePath(input)).toBeNull();
  });

  it('normalises a redundant but safe path', () => {
    expect(safeRelativePath('reference/./rules.md')).toBe('reference/rules.md');
  });

  it('rejects a path that only escapes after normalisation', () => {
    expect(safeRelativePath('a/b/../../../escape.md')).toBeNull();
  });
});

describe('isInsidePackage', () => {
  it('accepts the package root and paths beneath it', () => {
    expect(isInsidePackage('/data/skills/foo', '/data/skills/foo')).toBe(true);
    expect(isInsidePackage('/data/skills/foo', '/data/skills/foo/SKILL.md')).toBe(true);
  });

  it('rejects a sibling whose name merely starts the same', () => {
    // The prefix check has to be separator-aware, or /foo-evil passes as /foo.
    expect(isInsidePackage('/data/skills/foo', '/data/skills/foo-evil/SKILL.md')).toBe(false);
  });

  it('rejects a path outside the package', () => {
    expect(isInsidePackage('/data/skills/foo', '/etc/passwd')).toBe(false);
  });
});

describe('file classification', () => {
  it('classifies by location, not by extension', () => {
    expect(classifyFile('SKILL.md')).toBe('instruction');
    expect(classifyFile('scripts/tool.py')).toBe('script');
    expect(classifyFile('reference/rules.md')).toBe('reference');
    // A .py outside scripts/ is still reference material — kind is
    // presentational, because nothing is ever executed either way.
    expect(classifyFile('examples/tool.py')).toBe('reference');
  });

  it('maps known extensions to a content type and everything else to binary', () => {
    expect(contentTypeFor('a.md')).toBe('text/markdown');
    expect(contentTypeFor('a.py')).toBe('text/x-python');
    expect(contentTypeFor('a.png')).toBe('application/octet-stream');
  });

  it('treats binary and oversized files as non-viewable', () => {
    expect(isViewable('logo.png', 10)).toBe(false);
    expect(isViewable('big.md', 10 * 1024 * 1024)).toBe(false);
    expect(isViewable('small.md', 100)).toBe(true);
  });
});
