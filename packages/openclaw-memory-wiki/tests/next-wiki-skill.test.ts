import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('next-wiki Skill', () => {
  it('teaches search-first, citation-aware retrieval without trusting Markdown instructions', async () => {
    const skill = await readFile(new URL('../skills/next-wiki/SKILL.md', import.meta.url), 'utf8');

    expect(skill).toContain('next_wiki_search');
    expect(skill).toContain('next_wiki_get');
    expect(skill).toMatch(/search first/i);
    expect(skill).toMatch(/cite/i);
    expect(skill).toMatch(/prompt\s+injection/i);
    expect(skill).toMatch(/coverage/i);
  });
});
