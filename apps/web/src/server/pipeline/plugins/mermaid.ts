import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import type { PipelineContext, PipelinePlugin } from "../index";

/**
 * Mermaid plugin — converts ```mermaid code blocks into placeholder divs for
 * client-side rendering.
 *
 * Strategy: Mermaid is primarily a client-side library; server-side rendering
 * requires a headless browser or JSDOM shim. Instead, we encode the source as
 * base64 in a data attribute and let client JS (Phase 5) render the diagram.
 *
 * Input (hast):  pre > code.language-mermaid { text content }
 * Output (hast): div.mermaid-diagram[data-diagram=<base64>]
 */
function transformMermaid(tree: Root, _context: PipelineContext): Root {
  let hasMermaid = false;

  // First pass — detect presence to avoid unnecessary work.
  visit(tree, "element", (node: Element) => {
    if (
      node.tagName === "code" &&
      Array.isArray(node.properties?.className) &&
      (node.properties.className as string[]).includes("language-mermaid")
    ) {
      hasMermaid = true;
    }
  });

  if (!hasMermaid) return tree;

  // Second pass — replace pre>code.language-mermaid with placeholder div.
  visit(tree, "element", (node: Element, index, parent) => {
    if (
      node.tagName !== "pre" ||
      parent === null ||
      index === null
    ) {
      return;
    }

    const codeChild = node.children.find(
      (child): child is Element =>
        child.type === "element" &&
        child.tagName === "code" &&
        Array.isArray(child.properties?.className) &&
        (child.properties.className as string[]).includes("language-mermaid"),
    );

    if (!codeChild) return;

    // Extract raw text from the code node.
    const rawSource = codeChild.children
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; value: string }).value)
      .join("");

    const encoded = Buffer.from(rawSource).toString("base64");

    const placeholder: Element = {
      type: "element",
      tagName: "div",
      properties: {
        className: ["mermaid-diagram"],
        dataDiagram: encoded,
      },
      children: [],
    };

    (parent.children as Element[]).splice(index, 1, placeholder);
  });

  return tree;
}

export const mermaidPlugin: PipelinePlugin = {
  name: "mermaid",
  transform: transformMermaid as (
    tree: import("unist").Node,
    context: PipelineContext,
  ) => import("unist").Node,
};
