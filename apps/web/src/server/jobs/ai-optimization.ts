import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { providerRuntime } from '@/server/services/ai-admin';
import { assertAiFeature } from '@/server/services/ai-entitlements';
import { appendActionEvent, finishAction, isCancellationRequested, readActionInput } from '@/server/services/ai-actions';
import { assertEditableRevision } from '@/server/services/ai-optimization';

type OptimizationInput = {
  pageId: string;
  revisionId: string;
  selection: { text: string; hash: string; from: number; to: number };
  instruction: 'improve_clarity' | 'fix_grammar' | 'shorten' | 'expand';
};

const instructions = {
  improve_clarity: 'Improve clarity while preserving meaning, Markdown, tone, and language.',
  fix_grammar: 'Fix grammar and spelling while preserving meaning, Markdown, tone, and language.',
  shorten: 'Make the text more concise while preserving essential meaning and Markdown.',
  expand: 'Expand the text with useful detail grounded only in the original text; preserve Markdown and language.',
};

export async function runTextOptimizationAction(actionId: string): Promise<void> {
  const input = await readActionInput<OptimizationInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.actorUserId || !action.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Optimization input expired');
  }
  const [user, model] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) }),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if (!user || user.status !== 'active' || !model) throw new DomainError('CANCELLED', 'Optimization is no longer authorized');
  const ctx = buildUserCtx(user.id, user.role);
  await assertAiFeature(ctx, 'text');
  await assertEditableRevision(ctx, input.pageId, input.revisionId);

  let replacement = '';
  let usage: Record<string, unknown> = {};
  for await (const event of createAiProviderAdapter(await providerRuntime(action.providerId)).streamText({
    actionId,
    modelExternalId: model.externalId,
    system:
      'Return only replacement Markdown for the selected range. Do not add commentary, quotation fences, or explanations.',
    messages: [{ role: 'user', content: `${instructions[input.instruction]}\n\n<selection>\n${input.selection.text}\n</selection>` }],
    maxOutputTokens: model.maxOutputTokens ?? undefined,
    temperature: 0.2,
    abortSignal: new AbortController().signal,
  })) {
    if (await isCancellationRequested(actionId)) throw new DomainError('CANCELLED', 'Optimization was cancelled');
    if (event.type === 'delta') replacement += event.text;
    if (event.type === 'usage') usage = event;
  }
  if (!replacement.trim()) throw new DomainError('INVALID_RESPONSE', 'AI returned an empty replacement');
  await assertAiFeature(ctx, 'text');
  await assertEditableRevision(ctx, input.pageId, input.revisionId);
  await appendActionEvent(actionId, 'optimization', {
    replacement,
    selectionHash: input.selection.hash,
    from: input.selection.from,
    to: input.selection.to,
  });
  await finishAction(actionId, 'completed', {
    resultMetadata: { replacementBytes: Buffer.byteLength(replacement), selectionHash: input.selection.hash },
    usageMetadata: usage,
  });
}
