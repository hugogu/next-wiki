import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { skillsUsedByAction, skillsUsedByWorkflow } from './attribution';
import { recordSkillUsage } from './registry';
import { listSkillSettings } from './store';

/**
 * Skill attribution and usage (028, FR-024, FR-045).
 *
 * Attribution is derived from `ai_tool_calls` rather than stored again: loading
 * a skill IS a tool call, so a parallel record would be a second source of
 * truth that could disagree with the timeline the user actually saw.
 */

async function seedTurn(calls: Array<{ tool: string; args: unknown; status?: string }>) {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `attr-${randomUUID()}@example.com`,
      passwordHash: 'x',
      role: 'admin',
      status: 'active',
    })
    .returning();
  const [action] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      status: 'completed',
      actorUserId: user!.id,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning();
  const [workflow] = await db
    .insert(schema.aiToolWorkflows)
    .values({ aiActionId: action!.id, actorUserId: user!.id, maxCalls: 20 })
    .returning();
  let sequence = 0;
  for (const call of calls) {
    sequence += 1;
    await db.insert(schema.aiToolCalls).values({
      workflowId: workflow!.id,
      aiActionId: action!.id,
      providerKey: 'next-wiki',
      toolName: call.tool,
      sequence,
      commandMarkdown: '```tool\n```',
      arguments: call.args as never,
      status: (call.status ?? 'succeeded') as never,
    });
  }
  return { actionId: action!.id, workflowId: workflow!.id };
}

describe('skill attribution', () => {
  it('names the skills a turn loaded, in order, without duplicates', async () => {
    const { actionId, workflowId } = await seedTurn([
      { tool: 'search_wiki', args: { query: 'backup' } },
      { tool: 'load_skill', args: { name: 'wiki-linker' } },
      { tool: 'read_skill_file', args: { name: 'wiki-linker', path: 'reference/link-rules.md' } },
      { tool: 'load_skill', args: { name: 'wiki-writer' } },
      { tool: 'save_draft', args: { pageId: 'p1' } },
    ]);
    await expect(skillsUsedByAction(actionId)).resolves.toEqual(['wiki-linker', 'wiki-writer']);
    await expect(skillsUsedByWorkflow(workflowId)).resolves.toEqual(['wiki-linker', 'wiki-writer']);
  });

  it('ignores a load that did not succeed', async () => {
    // A denied or failed load did not influence the outcome, so attributing the
    // change to it would be a lie about what the assistant actually followed.
    const { actionId } = await seedTurn([
      { tool: 'load_skill', args: { name: 'wiki-tagger' }, status: 'failed' },
      { tool: 'load_skill', args: { name: 'wiki-writer' } },
    ]);
    await expect(skillsUsedByAction(actionId)).resolves.toEqual(['wiki-writer']);
  });

  it('returns nothing for a turn that used no skill', async () => {
    const { actionId } = await seedTurn([{ tool: 'search_wiki', args: { query: 'x' } }]);
    await expect(skillsUsedByAction(actionId)).resolves.toEqual([]);
  });

  it('tolerates a malformed argument payload', async () => {
    const { actionId } = await seedTurn([
      { tool: 'load_skill', args: { notName: 'wiki-writer' } },
      { tool: 'load_skill', args: [] },
    ]);
    await expect(skillsUsedByAction(actionId)).resolves.toEqual([]);
  });
});

describe('skill usage timestamps', () => {
  it('records when a skill was last used', async () => {
    const before = await listSkillSettings();
    expect(before.get('wiki-writer')?.lastUsedAt ?? null).toBeNull();

    await recordSkillUsage('wiki-writer');

    const after = await listSkillSettings();
    const setting = after.get('wiki-writer');
    expect(setting).toBeDefined();
    expect(setting!.lastUsedAt).toBeInstanceOf(Date);
    // Recording usage must not silently change whether the skill is enabled.
    expect(setting!.enabled).toBe(true);
  });

  it('does not flip an explicit disable when the skill is used', async () => {
    await db
      .insert(schema.skillSettings)
      .values({ name: 'wiki-tagger', enabled: false })
      .onConflictDoUpdate({ target: schema.skillSettings.name, set: { enabled: false } });

    await recordSkillUsage('wiki-tagger');

    const settings = await listSkillSettings();
    expect(settings.get('wiki-tagger')?.enabled).toBe(false);
    expect(settings.get('wiki-tagger')?.lastUsedAt).toBeInstanceOf(Date);
  });
});
