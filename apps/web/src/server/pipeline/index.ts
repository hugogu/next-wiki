import type { Node } from "unist";

export type PipelineContext = {
  pageId: string;
  revisionId: string;
  spaceKey: string;
  locale: string;
  contentHash: string;
};

export type PipelinePlugin = {
  name: string;
  transform: (tree: Node, context: PipelineContext) => Node | Promise<Node>;
};

export type PipelineOptions = {
  plugins?: PipelinePlugin[];
  skipCache?: boolean;
};

export type RenderResult = {
  html: string;
  metadata: {
    headings: Array<{ level: number; text: string; anchor: string }>;
    links: Array<{ href: string; text: string }>;
    imageCount: number;
  };
};

/**
 * Execute the rendering pipeline: source → parse → transform[] → render.
 * Sanitization is always the last step and cannot be skipped.
 */
export async function renderPage(
  sourceContent: string,
  context: PipelineContext,
  options: PipelineOptions = {},
): Promise<RenderResult> {
  // Dynamic imports keep the pipeline tree-shakeable in the Next.js bundle.
  const { processMarkdown } = await import("./plugins/markdown");
  const { sanitizeHtml } = await import("./plugins/sanitize");
  const { getFromCache, setInCache } = await import("./cache");

  // Check render cache by revision identity.
  if (!options.skipCache) {
    const cached = await getFromCache(context.revisionId);
    if (cached) return cached;
  }

  // source → parse → transform[] → render (via unified/remark/rehype)
  const result = await processMarkdown(sourceContent, context, options.plugins ?? []);

  // Non-optional sanitization — always applied after all transforms.
  const sanitizedHtml = sanitizeHtml(result.rawHtml);

  const renderResult: RenderResult = {
    html: sanitizedHtml,
    metadata: result.metadata,
  };

  if (!options.skipCache) {
    await setInCache(context.revisionId, renderResult);
  }

  return renderResult;
}
