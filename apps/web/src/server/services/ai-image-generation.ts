import type * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { resolveContentRevision } from './link-pages';
import { assertAiFeature } from './ai-entitlements';
import { createAction } from './ai-actions';
import { getAssignedModel } from './ai-question';
import { assertEditableRevision, selectionHash } from './ai-optimization';

export type ImageGenerationInput = {
  pageId: string;
  revisionId: string;
  source: { kind: 'page' } | { kind: 'selection'; text: string; hash: string };
  aspectRatio?: string;
};

/**
 * Markdown a `{ kind: 'page' }` illustration is derived from. A link page's own
 * revision is an empty placeholder — the content it publishes lives on its
 * generated target, so illustrating one has to follow the link exactly as the
 * reader and the editor do.
 */
export async function readIllustrationSource(
  page: typeof schema.pages.$inferSelect,
  revision: typeof schema.pageRevisions.$inferSelect,
): Promise<string> {
  const contentRevision = await resolveContentRevision(page, revision);
  return contentRevision?.contentSource ?? '';
}

export async function createImageGeneration(
  ctx: PermCtx,
  input: ImageGenerationInput,
  options: { enqueue?: boolean } = {},
) {
  await assertAiFeature(ctx, 'image');
  const { page, revision } = await assertEditableRevision(ctx, input.pageId, input.revisionId);
  if (input.source.kind === 'selection' && selectionHash(input.source.text) !== input.source.hash) {
    throw new DomainError('BAD_REQUEST', 'Selection hash is invalid');
  }
  const pageSource = input.source.kind === 'page' ? await readIllustrationSource(page, revision) : '';
  if (input.source.kind === 'page' && !pageSource) {
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
      sourceBytes: Buffer.byteLength(input.source.kind === 'page' ? pageSource : input.source.text),
      aspectRatio: input.aspectRatio ?? null,
      providerName: provider.name,
    },
    enqueue: options.enqueue,
  });
}
