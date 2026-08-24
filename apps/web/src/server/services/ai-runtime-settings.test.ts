import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import {
  getAiRuntimeSettings,
  resolveAiRuntimeConfig,
  updateAiRuntimeSettings,
} from '@/server/services/ai-runtime-settings';
import { buildWikiToolSystemPrompt } from '@/server/jobs/wiki-question-tool-planner';
import { FOLLOW_QUESTION_LANGUAGE_RULE } from '@/server/ai/prompts/wiki-question';
import { getToolDefinition } from '@/server/services/ai-tool-registry';

const readerCtx = buildUserCtx('reader-1', 'reader');

async function seedAdminCtx(): Promise<PermCtx> {
  const [admin] = await db
    .insert(schema.users)
    .values({ email: `runtime-admin-${crypto.randomUUID()}@example.com`, passwordHash: 'HASH', role: 'admin', status: 'active' })
    .returning({ id: schema.users.id });
  return buildUserCtx(admin!.id, 'admin');
}

describe('ai runtime settings (026)', () => {
  let adminCtx: PermCtx;

  beforeEach(async () => {
    adminCtx = await seedAdminCtx();
  });

  it('resolves built-in defaults when nothing is configured', async () => {
    const config = await resolveAiRuntimeConfig();
    expect(config.maxToolCalls).toBe(100);
    expect(config.plannerTemperature).toBeCloseTo(0.1);
    expect(config.plannerMaxOutputTokens).toBe(32_768);
    expect(config.assistantSystemPrompt).toBeNull();
    expect(config.toolSystemPrompt).toBeNull();
    expect(config.answerLanguage).toBe('model_default');
    expect(config.anonymousWikiAiEnabled).toBe(false);
  });

  it('persists the answer language and reflects it in the admin view', async () => {
    await updateAiRuntimeSettings(adminCtx, { answerLanguage: 'follow_question' });
    expect((await resolveAiRuntimeConfig()).answerLanguage).toBe('follow_question');
    expect((await getAiRuntimeSettings(adminCtx)).params.answerLanguage).toBe('follow_question');

    await updateAiRuntimeSettings(adminCtx, { answerLanguage: 'model_default' });
    expect((await resolveAiRuntimeConfig()).answerLanguage).toBe('model_default');
  });

  it('persists the anonymous Wiki AI access switch', async () => {
    await updateAiRuntimeSettings(adminCtx, { anonymousWikiAiEnabled: true });
    expect((await resolveAiRuntimeConfig()).anonymousWikiAiEnabled).toBe(true);
    expect((await getAiRuntimeSettings(adminCtx)).params.anonymousWikiAiEnabled).toBe(true);
  });

  it('leaves the answer language untouched when another param is saved', async () => {
    await updateAiRuntimeSettings(adminCtx, { answerLanguage: 'follow_question' });
    await updateAiRuntimeSettings(adminCtx, { toolMaxCalls: 7 });
    expect((await resolveAiRuntimeConfig()).answerLanguage).toBe('follow_question');
  });

  it('shows runtime settings to a non-admin but rejects their writes', async () => {
    await expect(getAiRuntimeSettings(readerCtx)).resolves.toMatchObject({ params: expect.any(Object) });
    await expect(updateAiRuntimeSettings(readerCtx, { toolMaxCalls: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exposes built-in prompt defaults for the admin editor', async () => {
    const view = await getAiRuntimeSettings(adminCtx);
    expect(view.prompts.assistantSystemPrompt).toBeNull();
    expect(view.defaults.assistantSystemPrompt.length).toBeGreaterThan(0);
    expect(view.defaults.toolSystemPrompt).toContain('{{TOOLS}}');
  });

  it('persists params and round-trips the temperature through hundredths storage', async () => {
    await updateAiRuntimeSettings(adminCtx, {
      toolMaxCalls: 40,
      plannerTemperature: 0.35,
      plannerMaxOutputTokens: 2048,
    });
    const config = await resolveAiRuntimeConfig();
    expect(config.maxToolCalls).toBe(40);
    expect(config.plannerTemperature).toBeCloseTo(0.35);
    expect(config.plannerMaxOutputTokens).toBe(2048);
  });

  it('stores a prompt override and clears it back to the default when blanked', async () => {
    await updateAiRuntimeSettings(adminCtx, { assistantSystemPrompt: 'You are a terse wiki bot.' });
    expect((await resolveAiRuntimeConfig()).assistantSystemPrompt).toBe('You are a terse wiki bot.');
    await updateAiRuntimeSettings(adminCtx, { assistantSystemPrompt: '   ' });
    expect((await resolveAiRuntimeConfig()).assistantSystemPrompt).toBeNull();
  });
});

describe('buildWikiToolSystemPrompt overrides', () => {
  const tools = [getToolDefinition('search_wiki')!];

  it('injects the live tool catalog at the placeholder', () => {
    const prompt = buildWikiToolSystemPrompt(tools, { toolSystemPrompt: 'Custom rules.\nAvailable tools:\n{{TOOLS}}' });
    expect(prompt).toContain('Custom rules.');
    expect(prompt).toContain('- search_wiki (read)');
    expect(prompt).not.toContain('{{TOOLS}}');
  });

  it('replaces the core assistant prompt when overridden', () => {
    const prompt = buildWikiToolSystemPrompt(tools, { assistantSystemPrompt: 'PERSONA-OVERRIDE' });
    expect(prompt.startsWith('PERSONA-OVERRIDE')).toBe(true);
  });

  it('appends the tool catalog when the admin removed the marker', () => {
    const prompt = buildWikiToolSystemPrompt(tools, { toolSystemPrompt: 'No marker here.' });
    expect(prompt).toContain('- search_wiki (read)');
  });

  it('adds a language rule only when the answer language follows the question', () => {
    expect(buildWikiToolSystemPrompt(tools, {})).not.toContain(FOLLOW_QUESTION_LANGUAGE_RULE);
    expect(buildWikiToolSystemPrompt(tools, { answerLanguage: 'model_default' })).not.toContain(
      FOLLOW_QUESTION_LANGUAGE_RULE,
    );
    expect(buildWikiToolSystemPrompt(tools, { answerLanguage: 'follow_question' })).toContain(
      FOLLOW_QUESTION_LANGUAGE_RULE,
    );
  });

  it('keeps the language rule when the admin replaced the core assistant prompt', () => {
    // The rule lives outside the editable core prompt precisely so rewriting
    // that prompt cannot silently disable the setting.
    const prompt = buildWikiToolSystemPrompt(tools, {
      assistantSystemPrompt: 'PERSONA-OVERRIDE',
      answerLanguage: 'follow_question',
    });
    expect(prompt).toContain('PERSONA-OVERRIDE');
    expect(prompt).toContain(FOLLOW_QUESTION_LANGUAGE_RULE);
  });
});
