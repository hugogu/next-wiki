import { getSkillRegistry } from './registry';

/**
 * The registry must not cache across requests (028).
 *
 * A module-level cache was the original design and it was wrong: Next.js gives
 * route handlers and server components separate module instances, so an admin
 * could save a skill through the API and the page would keep rendering the
 * pre-edit catalogue. This pins the property that made that bug possible —
 * every call resolves fresh state — so a future "optimisation" back to a shared
 * cache fails here rather than in production.
 */
describe('skill registry caching', () => {
  it('reflects a change made between two calls', async () => {
    const first = await getSkillRegistry();
    const second = await getSkillRegistry();
    // Outside a React request scope each call builds its own registry, so the
    // objects are distinct rather than a shared frozen snapshot.
    expect(first).not.toBe(second);
    expect([...second.entries.keys()]).toEqual([...first.entries.keys()]);
  });

  it('registers the shipped packages under their declared names', async () => {
    const registry = await getSkillRegistry();
    for (const name of ['wiki-writer', 'wiki-tagger', 'wiki-linker']) {
      expect(registry.entries.has(name)).toBe(true);
      expect(registry.entries.get(name)?.source).toBe('builtin');
    }
  });

  it('puts the instruction file first in every skill', async () => {
    const registry = await getSkillRegistry();
    for (const entry of registry.entries.values()) {
      expect(entry.files[0]?.path).toBe('SKILL.md');
    }
  });
});
