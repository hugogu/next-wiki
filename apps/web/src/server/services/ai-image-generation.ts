import type * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertAiFeature } from './ai-entitlements';
import { createAction } from './ai-actions';
import { getAssignedModel } from './ai-question';
import { assertEditableRevision, selectionHash } from './ai-optimization';

export type ImageGenerationInput = {
  pageId: string;
  revisionId: string;
  source: { kind: 'page' } | { kind: 'selection'; text: string; hash?: string };
  aspectRatio?: string;
};

export async function readIllustrationSource(
  page: typeof schema.pages.$inferSelect,
  revision: typeof schema.pageRevisions.$inferSelect,
): Promise<string> {
  if (page.kind === 'link') return '';
  return revision.contentSource ?? '';
}

export async function createImageGeneration(
  ctx: PermCtx,
  input: ImageGenerationInput,
  options: { enqueue?: boolean } = {},
) {
  await assertAiFeature(ctx, 'image');
  const { page, revision } = await assertEditableRevision(ctx, input.pageId, input.revisionId);
  if (input.source.kind === 'selection') {
    const source = await readIllustrationSource(page, revision);
    const first = source.indexOf(input.source.text);
    if (first < 0) {
      throw new DomainError('BAD_REQUEST', 'The selected image source is not present in this revision. Refresh the page and try again.');
    }
    if (source.indexOf(input.source.text, first + input.source.text.length) >= 0) {
      throw new DomainError('BAD_REQUEST', 'The selected image source occurs more than once. Select a more specific passage and try again.');
    }
  }
  const pageSource = input.source.kind === 'page' ? await readIllustrationSource(page, revision) : '';
  if (input.source.kind === 'page' && !pageSource) {
    throw new DomainError('NOT_FOUND', 'Page source is unavailable');
  }
  const { model, provider } = await getAssignedModel('wiki_image');
  const normalizedInput: ImageGenerationInput = input.source.kind === 'selection'
    ? { ...input, source: { kind: 'selection', text: input.source.text, hash: selectionHash(input.source.text) } }
    : input;
  return createAction(ctx, {
    feature: 'image_generation',
    input: normalizedInput,
    providerId: provider.id,
    modelId: model.id,
    pageId: page.id,
    requestMetadata: {
      sourceKind: normalizedInput.source.kind,
      sourceBytes: Buffer.byteLength(normalizedInput.source.kind === 'page' ? pageSource : normalizedInput.source.text),
      aspectRatio: normalizedInput.aspectRatio ?? null,
      providerName: provider.name,
    },
    enqueue: options.enqueue,
  });
}
