import { BUILTIN_SKILL_PACKAGES, loadBuiltinSkills } from './builtin';
import { parseInstructionFile } from './package';

/**
 * The shipped packages (028, FR-039..FR-041, FR-044).
 *
 * These are content, not code, so the checks that matter are that they load,
 * that they say what the registry will claim they say, and that the constraints
 * a reviewer depends on are actually written down in them.
 */
describe('built-in skill packages', () => {
  it('all three load and declare the name their directory uses', async () => {
    const skills = await loadBuiltinSkills();
    expect(skills.map((skill) => skill.name).sort()).toEqual([...BUILTIN_SKILL_PACKAGES].sort());
  });

  it('declares a description written for trigger matching, not prose', async () => {
    for (const skill of await loadBuiltinSkills()) {
      // Under model-driven selection the description is the only thing between
      // a request and the right skill, so it must name the task and the words
      // users actually use.
      expect(skill.description.length).toBeGreaterThan(40);
      expect(skill.description.toLowerCase()).toContain('use when');
    }
  });

  it('has a parseable instruction file whose frontmatter matches the loaded metadata', async () => {
    for (const skill of await loadBuiltinSkills()) {
      const instruction = skill.files.find((file) => file.path === 'SKILL.md');
      expect(instruction).toBeDefined();
      const parsed = parseInstructionFile(instruction!.content);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.name).toBe(skill.name);
      expect(parsed.value.description).toBe(skill.description);
    }
  });

  it('states that Wiki Writer never publishes', async () => {
    const writer = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-writer');
    const body = writer?.files.find((file) => file.path === 'SKILL.md')?.content ?? '';
    expect(body).toMatch(/never publishes/i);
    expect(body).toContain('create_page');
    expect(body).toContain('save_draft');
  });

  it('states every Wiki Linker positional constraint a reviewer relies on', async () => {
    const linker = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-linker');
    const text = (linker?.files ?? []).map((file) => file.content).join('\n').toLowerCase();
    // SC-009: no link may be proposed in a position where it would break the
    // page, and an ambiguous or missing target must be left alone.
    for (const constraint of ['existing link', 'code', 'heading', 'ambiguous', 'first']) {
      expect(text).toContain(constraint);
    }
  });

  it('tells Wiki Tagger to read the existing vocabulary before proposing', async () => {
    const tagger = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-tagger');
    const body = tagger?.files.find((file) => file.path === 'SKILL.md')?.content ?? '';
    expect(body).toContain('list_tags');
    expect(body).toMatch(/replaces the whole set|complete/i);
  });

  it('marks every shipped script as reference material', async () => {
    const scripts = (await loadBuiltinSkills()).flatMap((skill) =>
      skill.files.filter((file) => file.kind === 'script'),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.content).toContain('REFERENCE MATERIAL');
      expect(script.content).toMatch(/does not execute skill scripts/i);
    }
  });
});
