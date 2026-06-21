import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import type { ImageGenerationOutput } from '@/server/ai/types';
import { validateImage } from '@/server/content-store/image-validation';
import { providerRuntime } from '@/server/services/ai-admin';
import { assertAiFeature } from '@/server/services/ai-entitlements';
import { appendActionEvent, finishAction, isCancellationRequested, readActionInput } from '@/server/services/ai-actions';
import { assertEditableRevision } from '@/server/services/ai-optimization';
import { getAssignedModel } from '@/server/services/ai-question';

type ImageInput = {
  pageId: string;
  revisionId: string;
  source: { kind: 'page' } | { kind: 'selection'; text: string; hash: string };
  aspectRatio?: string;
};

// Image models cap their prompt length (MiniMax 1500, DALL·E ~4000 chars), so
// keep the whole prompt comfortably under the smallest known limit.
const IMAGE_PROMPT_MAX_CHARS = 1_400;
// Above this, the raw content is condensed into a visual scene by the chat
// model rather than truncated, so the illustration reflects the whole page.
const IMAGE_PROMPT_SUMMARIZE_THRESHOLD = 1_000;

/**
 * Condense long page content into a concise visual scene description using the
 * assigned chat model. Returns null when no chat model is configured or it
 * yields nothing, so the caller can fall back to truncated raw content.
 */
async function summarizeForIllustration(actionId: string, title: string, source: string): Promise<string | null> {
  let assigned;
  try {
    assigned = await getAssignedModel('wiki_text');
  } catch {
    return null;
  }
  const { model, provider } = assigned;
  let summary = '';
  for await (const event of createAiProviderAdapter(await providerRuntime(provider.id)).streamText({
    actionId,
    modelExternalId: model.externalId,
    system:
      'You write a concise visual scene description for a single thematic illustration. '
      + 'Output only the description, under 1000 characters, no Markdown, no preamble.',
    messages: [
      {
        role: 'user',
        content:
          `Summarize the following wiki page titled "${title}" into a vivid visual scene for a header illustration. `
          + `Focus on concrete imagery; avoid text, UI and logos.\n\n${source.slice(0, 8_000)}`,
      },
    ],
    maxOutputTokens: 500,
    temperature: 0.4,
    abortSignal: new AbortController().signal,
  })) {
    if (await isCancellationRequested(actionId)) throw new DomainError('CANCELLED', 'Image generation was cancelled');
    if (event.type === 'delta') summary += event.text;
  }
  return summary.trim() || null;
}

async function readBoundedResponse(response: Response): Promise<Buffer> {
  if (!response.ok || !response.body) throw new DomainError('PROVIDER_UNAVAILABLE', 'Generated image could not be downloaded');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > env.AI_MAX_GENERATED_IMAGE_BYTES) {
      await reader.cancel();
      throw new DomainError('INPUT_TOO_LARGE', 'Generated image is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function outputBytes(output: ImageGenerationOutput): Promise<Buffer> {
  if (output.kind === 'bytes') return Buffer.from(output.bytes);
  if (output.kind === 'data_url') {
    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(output.dataUrl);
    if (!match) throw new DomainError('INVALID_RESPONSE', 'Provider returned an invalid image data URL');
    const bytes = Buffer.from(match[1]!, 'base64');
    if (bytes.byteLength > env.AI_MAX_GENERATED_IMAGE_BYTES) throw new DomainError('INPUT_TOO_LARGE', 'Generated image is too large');
    return bytes;
  }
  const url = new URL(output.url);
  if (url.protocol !== 'https:' && !(env.NODE_ENV === 'test' && url.protocol === 'http:')) {
    throw new DomainError('INVALID_RESPONSE', 'Provider returned an unsafe image URL');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_PROVIDER_REQUEST_TIMEOUT_MS);
  try {
    return await readBoundedResponse(await fetch(url, { signal: controller.signal, redirect: 'error' }));
  } finally {
    clearTimeout(timer);
  }
}

export async function runImageGenerationAction(actionId: string): Promise<void> {
  const input = await readActionInput<ImageInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.actorUserId || !action.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Image input expired');
  }
  const [user, model] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) }),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if (!user || user.status !== 'active' || !model) throw new DomainError('CANCELLED', 'Image generation is no longer authorized');
  const ctx = buildUserCtx(user.id, user.role);
  await assertAiFeature(ctx, 'image');
  const { page, revision } = await assertEditableRevision(ctx, input.pageId, input.revisionId);
  const source = input.source.kind === 'page' ? revision.contentSource ?? '' : input.source.text;
  // Frame the prompt around the subject itself, not "a wiki page" — otherwise
  // image models tend to render a screenshot of a website/UI full of text.
  const baseInstruction =
    'Create a single illustrative image that visually represents the topic below. '
    + 'Depict the concept itself — never a website, web page, browser, app, screenshot, '
    + 'user interface, document, or blocks of text, and no logos or watermarks. ';
  const summary =
    source.length > IMAGE_PROMPT_SUMMARIZE_THRESHOLD
      ? await summarizeForIllustration(actionId, page.title, source)
      : null;
  if (await isCancellationRequested(actionId)) throw new DomainError('CANCELLED', 'Image generation was cancelled');
  const prompt = (
    summary
      ? `${baseInstruction}Topic: ${summary}`
      : `${baseInstruction}Topic context:\n\n${source}`
  ).slice(0, IMAGE_PROMPT_MAX_CHARS);
  const output = await createAiProviderAdapter(await providerRuntime(action.providerId)).generateImage({
    actionId,
    modelExternalId: model.externalId,
    prompt,
    aspectRatio: input.aspectRatio,
    abortSignal: new AbortController().signal,
  });
  if (await isCancellationRequested(actionId)) throw new DomainError('CANCELLED', 'Image generation was cancelled');
  const bytes = await outputBytes(output);
  const validated = validateImage(bytes, env.AI_MAX_GENERATED_IMAGE_BYTES);
  if (!validated.ok) throw new DomainError('INVALID_RESPONSE', 'Provider returned an unsupported or invalid image');
  const settings = await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.id, 'default') });
  const expiresAt = new Date(Date.now() + (settings?.artifactRetentionHours ?? env.AI_ARTIFACT_RETENTION_HOURS) * 3_600_000);
  const [artifact] = await db
    .insert(schema.aiGeneratedArtifacts)
    .values({
      actionId,
      contentType: validated.contentType,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      bytes,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.aiGeneratedArtifacts.actionId,
      set: { contentType: validated.contentType, contentHash: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.byteLength, bytes, expiresAt },
    })
    .returning({ id: schema.aiGeneratedArtifacts.id });
  await appendActionEvent(actionId, 'image_ready', {
    artifactId: artifact!.id,
    previewUrl: `/api/ai/generated-artifacts/${artifact!.id}`,
    contentType: validated.contentType,
    sizeBytes: bytes.byteLength,
    expiresAt: expiresAt.toISOString(),
  });
  await finishAction(actionId, 'completed', {
    resultMetadata: { artifactId: artifact!.id, contentType: validated.contentType, sizeBytes: bytes.byteLength },
    usageMetadata: output.usage ?? {},
  });
}
