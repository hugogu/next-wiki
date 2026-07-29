import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import * as content from '@/server/services/public-content';
import {
  getGeneratedArtifactPlacement,
  promoteGeneratedArtifact,
} from '@/server/services/ai-artifacts';

export type GeneratedImageInsertion = {
  artifactId: string;
  altText: string;
  /** Explicit placement for page-wide or legacy artifacts. Must be a unique
   * literal passage from the revision; insertion happens immediately after it. */
  afterText?: string;
};

type Placement = {
  after: string | null;
  markdown: string;
};

function markdownAltText(value: string): string {
  return value.trim().replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/[\r\n]+/g, ' ');
}

/**
 * Inserts Markdown without parsing, formatting, or serializing the source.
 * Applying insertions from the end keeps every byte outside insertion points
 * unchanged — particularly important for LaTex backslashes and hand-authored
 * whitespace.
 */
export function insertGeneratedImagesIntoMarkdown(source: string, placements: Placement[]): string {
  const insertions = placements.map((placement, order) => {
    if (placement.after === null) return { at: source.length, markdown: placement.markdown, order };
    const first = source.indexOf(placement.after);
    if (first < 0) {
      throw new DomainError('STALE_REVISION', 'The selected image source is no longer present in this revision. Refresh and try again.');
    }
    if (source.indexOf(placement.after, first + placement.after.length) >= 0) {
      throw new DomainError('BAD_REQUEST', 'The selected image source occurs more than once. Select a more specific passage and try again.');
    }
    return { at: first + placement.after.length, markdown: placement.markdown, order };
  });

  return insertions
    // For equal positions, apply the later requested image first so the final
    // document keeps the caller's requested image order.
    .sort((left, right) => right.at - left.at || right.order - left.order)
    .reduce((result, insertion) => {
      const separator = insertion.at > 0 && result[insertion.at - 1] === '\n' ? '\n' : '\n\n';
      return `${result.slice(0, insertion.at)}${separator}${insertion.markdown}${result.slice(insertion.at)}`;
    }, source);
}

/**
 * Promote generated artifacts and create one draft by inserting their Markdown
 * into the exact revision they were generated from. Unlike `save_draft`, this
 * path never asks a model to reproduce the page body.
 */
export async function insertGeneratedImages(
  ctx: PermCtx,
  input: {
    pageId: string;
    revisionId: string;
    images: GeneratedImageInsertion[];
  },
): Promise<{ version: number; assetIds: string[] }> {
  const page = await content.getPageById(ctx, input.pageId, ['latestRevision']);
  if (!page?.contentSource || page.latestRevision?.id !== input.revisionId) {
    throw new DomainError('STALE_REVISION', 'The page has changed since the images were generated. Refresh and try again.');
  }

  const prepared = await Promise.all(input.images.map(async (image) => {
    const placement = await getGeneratedArtifactPlacement(ctx, image.artifactId, input.pageId);
    if (placement && placement.revisionId !== input.revisionId) {
      throw new DomainError('STALE_REVISION', 'All images must have been generated from the current page revision.');
    }
    const asset = await promoteGeneratedArtifact(ctx, image.artifactId, input.pageId);
    return {
      after: image.afterText ?? (placement?.source.kind === 'selection' ? placement.source.text : null),
      markdown: `![${markdownAltText(image.altText)}](${asset.url})`,
      assetId: asset.id,
    };
  }));

  const nextSource = insertGeneratedImagesIntoMarkdown(page.contentSource, prepared);
  const revision = await content.createDraft(ctx, input.pageId, {
    title: page.title,
    contentSource: nextSource,
    baseRevisionId: input.revisionId,
  });
  return { version: revision.version, assetIds: prepared.map((image) => image.assetId) };
}
