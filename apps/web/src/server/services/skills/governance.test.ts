import { listSkills } from './registry';
import { listToolDefinitions } from '@/server/services/ai-tool-registry';
import { loadBuiltinSkills } from './builtin';

/**
 * Skills confer no authority (028, FR-023, FR-044, SC-011).
 *
 * A skill is prompt text that reaches the model through the governed tool
 * runtime. These pin the properties that make that claim true rather than
 * aspirational: the skill tools are read-only, the built-ins can only reach
 * tools that already exist, and none of them can publish.
 */
describe('built-in skills cannot exceed the governed path', () => {
  it('ships enabled by default so a fresh install is useful with no configuration', async () => {
    const skills = await listSkills();
    const builtins = skills.filter((skill) => skill.source === 'builtin');
    expect(builtins).toHaveLength(3);
    expect(builtins.every((skill) => skill.enabled)).toBe(true);
  });

  it('exposes skill loading only through read-risk tools', () => {
    const tools = listToolDefinitions().filter((tool) =>
      ['load_skill', 'read_skill_file'].includes(tool.name),
    );
    expect(tools).toHaveLength(2);
    for (const tool of tools) {
      expect(tool.riskLevel).toBe('read');
      expect(tool.category).toBe('read');
      // Skill instructions are configuration, not evidence: they must never be
      // captured as Raw evidence when a turn produces durable knowledge.
      expect(tool.resultRetention).toBe('never_full_result');
    }
  });

  it('names only tools that actually exist', async () => {
    // A skill telling the model to call a tool the server does not have wastes
    // a turn and looks like the assistant malfunctioning.
    const known = new Set(listToolDefinitions().map((tool) => tool.name));
    const mentioned = /\b(create_page|save_draft|update_page_metadata|update_page_properties|replace_page_tags|create_tag|rename_tag|merge_tag|delete_tag|list_tags|search_wiki|list_pages|get_page|get_backlinks|get_neighborhood|generate_image|promote_generated_image|load_skill|read_skill_file)\b/g;
    for (const skill of await loadBuiltinSkills()) {
      const text = skill.files.map((file) => file.content).join('\n');
      for (const match of text.matchAll(mentioned)) {
        expect(known.has(match[0])).toBe(true);
      }
    }
  });

  it('never instructs the model to publish', async () => {
    // Checked as an absent imperative rather than by looking for negation words
    // near the word "publish": prose negates in too many ways for that to be a
    // reliable signal, and a false pass would be worse than no test.
    // A bare line beginning with "publish" is not evidence: prose wraps, and
    // Wiki Writer's own prohibition happens to break across a line that way.
    // Match only forms wrapping cannot produce.
    const imperative =
      /(?:^|\n)\s*(?:\d+\.|[-*])\s*publish\b|\bpublish the (?:page|draft|revision)\b|\b(?:then|finally|now) publish\b/i;
    for (const skill of await loadBuiltinSkills()) {
      const text = skill.files.map((file) => file.content).join('\n');
      expect(text).not.toMatch(imperative);
    }
  });

  it('routes every durable change through the draft or proposal path', async () => {
    const byName = new Map((await loadBuiltinSkills()).map((s) => [s.name, s]));
    const writer = byName.get('wiki-writer')!.files.map((f) => f.content).join('\n');
    expect(writer).toMatch(/create_page|save_draft/);
    expect(writer).toMatch(/draft or proposed revision|reviewable/i);

    const tagger = byName.get('wiki-tagger')!.files.map((f) => f.content).join('\n');
    expect(tagger).toMatch(/replace_page_tags|update_page_metadata/);

    const linker = byName.get('wiki-linker')!.files.map((f) => f.content).join('\n');
    expect(linker).toMatch(/save_draft/);
    expect(linker).toMatch(/reviewer approves or rejects|as one unit|one reviewable change/i);
  });

  it('tells each skill to work only on the pages the user named', async () => {
    const tagger = (await loadBuiltinSkills()).find((s) => s.name === 'wiki-tagger')!;
    const text = tagger.files.map((f) => f.content).join('\n');
    expect(text).toMatch(/only on the pages the user named|does not sweep/i);
    expect(text).toMatch(/do not present partial coverage as complete|say plainly which pages/i);
  });
});
