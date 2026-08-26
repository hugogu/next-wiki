import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import * as content from '@/server/services/public-content';
import {
  getGeneratedArtifactPlacement,
  promoteGeneratedArtifact,
} from '@/server/services/ai-artifacts';
import { applyPageContentEdits, resolveAnchorSpan } from '@/server/services/ai-page-content-patch';

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
 * Delegates the actual splice to `applyPageContentEdits` (037) — the same
 * engine `insert_page_content` uses — so there is one anchor-resolution and
 * splice implementation, not two. This function's only remaining job is
 * translating the image-specific placement shape into that engine's
 * `insertAfter` edits, including the visual separator a Markdown image needs
 * (the generic engine never invents whitespace on its own).
 */
export function insertGeneratedImagesIntoMarkdown(source: string, placements: Placement[]): string {
  const edits = placements.map((placement) => {
    const at = placement.after === null ? source.length : resolveAnchorSpan(source, placement.after).end;
    const separator = at > 0 && source[at - 1] === '\n' ? '\n' : '\n\n';
    return {
      anchor: placement.after,
      mode: 'insertAfter' as const,
      text: `${separator}${placement.markdown}`,
    };
  });
  return applyPageContentEdits(source, edits);
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
