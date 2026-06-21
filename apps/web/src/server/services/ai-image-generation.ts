import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertAiFeature } from './ai-entitlements';
import { createAction } from './ai-actions';
import { getAssignedModel } from './ai-question';
import { assertEditableRevision, selectionHash } from './ai-optimization';

export async function createImageGeneration(
  ctx: PermCtx,
  input: {
    pageId: string;
    revisionId: string;
    source: { kind: 'page' } | { kind: 'selection'; text: string; hash: string };
    aspectRatio?: string;
  },
) {
  await assertAiFeature(ctx, 'image');
  const { page, revision } = await assertEditableRevision(ctx, input.pageId, input.revisionId);
  if (input.source.kind === 'selection' && selectionHash(input.source.text) !== input.source.hash) {
    throw new DomainError('BAD_REQUEST', 'Selection hash is invalid');
  }
  if (input.source.kind === 'page' && !revision.contentSource) {
    throw new DomainError('NOT_FOUND', 'Page source is unavailable');
  }
  const { model, provider } = await getAssignedModel('wiki_image');
  return createAction(ctx, {
    feature: 'image_generation',
    input,
    providerId: provider.id,
    modelId: model.id,
    pageId: page.id,
    requestMetadata: {
      sourceKind: input.source.kind,
      sourceBytes: Buffer.byteLength(input.source.kind === 'page' ? revision.contentSource ?? '' : input.source.text),
      aspectRatio: input.aspectRatio ?? null,
      providerName: provider.name,
    },
  });
}
