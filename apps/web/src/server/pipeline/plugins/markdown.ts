import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import type { Node } from "unist";
import type { PipelineContext, PipelinePlugin } from "../index";

type MarkdownResult = {
  rawHtml: string;
  metadata: {
    headings: Array<{ level: number; text: string; anchor: string }>;
    links: Array<{ href: string; text: string }>;
    imageCount: number;
  };
};

export async function processMarkdown(
  source: string,
  context: PipelineContext,
  additionalPlugins: PipelinePlugin[],
): Promise<MarkdownResult> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeRaw)
    .use(rehypeStringify);

  // Parse markdown to mdast, then convert mdast → hast via processor.run().
  const mdast: Node = processor.parse(source);
  const hastTree = await processor.run(mdast);

  // Apply registered transform plugins to the hast tree.
  // Transformers receive the hast AST and context; they MUST NOT perform
  // write operations but may execute read-only database queries (e.g. link
  // validation).
  let tree: Node = hastTree;
  for (const plugin of additionalPlugins) {
    tree = await plugin.transform(tree, context);
  }

  const rawHtml = String(processor.stringify(tree));

  // Extract metadata from the source for link tracking and SEO.
  const headings: MarkdownResult["metadata"]["headings"] = [];
  const links: MarkdownResult["metadata"]["links"] = [];
  let imageCount = 0;

  // Simple extraction — detailed extraction done by the internal-links plugin.
  const headingMatches = rawHtml.matchAll(/<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h\1>/gi);
  for (const match of headingMatches) {
    headings.push({
      level: parseInt(match[1]!, 10),
      anchor: match[2] ?? "",
      text: (match[3] ?? "").replace(/<[^>]+>/g, ""),
    });
  }

  const linkMatches = rawHtml.matchAll(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi);
  for (const match of linkMatches) {
    links.push({ href: match[1] ?? "", text: (match[2] ?? "").replace(/<[^>]+>/g, "") });
  }

  imageCount = (rawHtml.match(/<img /gi) ?? []).length;

  return { rawHtml, metadata: { headings, links, imageCount } };
}
