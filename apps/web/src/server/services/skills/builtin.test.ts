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

  /**
   * Wiki Writer's guidance must match what this wiki actually renders.
   *
   * Telling the model to emit syntax the pipeline has no renderer for produces
   * a page that is worse than the one it replaced — a wall of unhighlighted
   * source where a diagram should be — and the model has no way to find that
   * out. These pin the guidance against the pipeline's real capabilities.
   */
  describe('Wiki Writer guidance matches the render pipeline', () => {
    const writerText = async () => {
      const writer = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-writer');
      expect(writer).toBeDefined();
      return writer!.files.map((file) => file.content).join('\n');
    };

    it('directs diagrams to Mermaid, which the pipeline renders', async () => {
      const text = await writerText();
      expect(text).toMatch(/```mermaid/);
      expect(text).toMatch(/graph TD|sequenceDiagram|classDiagram/);
    });

    it('says PlantUML is not rendered here rather than recommending it', async () => {
      // The pipeline has no PlantUML support at all; a ```plantuml block would
      // render as source.
      const text = await writerText();
      expect(text).toMatch(/PlantUML is not rendered/i);
      expect(text).not.toMatch(/use\s+PlantUML|```plantuml\n@startuml/i);
    });

    it('forbids drawing with text characters', async () => {
      expect(await writerText()).toMatch(/ASCII art/i);
    });

    it('states the KaTeX delimiters and the forms that fail silently', async () => {
      const text = await writerText();
      expect(text).toMatch(/\$\$/);
      expect(text).toMatch(/\\\[…\\\]|\\\(…\\\)/);
      expect(text).toMatch(/own lines/i);
      expect(text).toMatch(/code fence|backticks/i);
    });

    it('tells the model it cannot create images, only reference existing ones', async () => {
      // There is no image generation or upload tool in the registry, so an
      // invented URL is simply a broken image.
      const text = await writerText();
      expect(text).toMatch(/cannot create images|no tool that creates or uploads images/i);
      expect(text).toMatch(/already exist/i);
    });

    it('requires the abstract to be made concrete', async () => {
      const text = await writerText();
      expect(text).toMatch(/worked example/i);
      expect(text).toMatch(/real numbers/i);
    });

    it('requires the original\'s images and links to survive an expansion', async () => {
      const text = await writerText();
      expect(text).toMatch(/existing image reference/i);
      expect(text).toMatch(/external link/i);
    });
  });

  it('states that Wiki Writer never publishes', async () => {
    const writer = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-writer');
    const body = writer?.files.find((file) => file.path === 'SKILL.md')?.content ?? '';
    expect(body).toMatch(/never publishes/i);
    expect(body).toContain('create_page');
    expect(body).toContain('save_draft');
  });

  /**
   * Wiki Linker's constraints live in its instructions, not in code — the model
   * does the linking. So the testable property is that each rule a reviewer
   * depends on is actually written down: a constraint the skill never states is
   * a constraint the model will not follow (FR-042, FR-043, SC-009).
   */
  describe('Wiki Linker states every constraint a reviewer relies on', () => {
    const linkerText = async () => {
      const linker = (await loadBuiltinSkills()).find((skill) => skill.name === 'wiki-linker');
      expect(linker).toBeDefined();
      return (linker!.files ?? []).map((file) => file.content).join('\n').toLowerCase();
    };

    it.each([
      ['never nests inside an existing link', /existing link/],
      ['never links inside a code span or fenced block', /code span|code block|fenced/],
      ['never links inside a heading', /heading/],
      ['never links inside a URL or image reference', /url|image/],
      ['never links inside frontmatter', /frontmatter/],
      ['leaves a keyword with no target page as plain text', /no page stays plain text|without an existing/],
      ['skips an ambiguous match rather than guessing', /ambiguous|several pages/],
      ['skips a target the user cannot read', /cannot read/],
      ['links the first occurrence only', /first occurrence/],
      ['never links a page to itself', /self-link|itself/],
    ])('%s', async (_label, pattern) => {
      expect(await linkerText()).toMatch(pattern);
    });

    it('requires the answer to list keyword, location, and target per link', async () => {
      // FR-043: the structured list is what a reviewer reads alongside the
      // diff, so the skill must ask for it explicitly.
      const text = await linkerText();
      expect(text).toMatch(/one line per proposed link|keyword.*location.*target/s);
      expect(text).toMatch(/skipped/);
    });
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
