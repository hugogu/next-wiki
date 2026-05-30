import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import type { PipelineContext, PipelinePlugin } from "../index";

/**
 * draw.io plugin — converts draw.io diagrams to client-renderable placeholders.
 *
 * Two embedding strategies are handled:
 *
 * 1. Code block form:  ```drawio  or  ```xml (with data-drawio attribute)
 *    pre > code.language-drawio  →  div.drawio-diagram[data-diagram=<base64>]
 *
 * 2. Asset reference form:  ![alt](file.drawio)
 *    img[src$=".drawio"]        →  div.drawio-asset[data-asset-url=<src>]
 *
 * Original content is preserved in data attributes per FR-038 (unsupported
 * content must not be silently discarded).
 */
function transformDrawio(tree: Root, _context: PipelineContext): Root {
  let hasDrawio = false;

  // Quick presence check.
  visit(tree, "element", (node: Element) => {
    if (hasDrawio) return;
    if (isDrawioCodeNode(node) || isDrawioImgNode(node)) {
      hasDrawio = true;
    }
  });

  if (!hasDrawio) return tree;

  // Replace pre>code.language-drawio blocks.
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "pre" || parent === null || index === null) return;

    const codeChild = node.children.find(
      (child): child is Element =>
        child.type === "element" && isDrawioCodeNode(child),
    );

    if (!codeChild) return;

    const rawSource = codeChild.children
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; value: string }).value)
      .join("");

    const encoded = Buffer.from(rawSource).toString("base64");

    const placeholder: Element = {
      type: "element",
      tagName: "div",
      properties: {
        className: ["drawio-diagram"],
        dataDiagram: encoded,
      },
      children: [],
    };

    (parent.children as Element[]).splice(index, 1, placeholder);
  });

  // Replace img elements whose src points to a .drawio file.
  visit(tree, "element", (node: Element, index, parent) => {
    if (!isDrawioImgNode(node) || parent === null || index === null) return;

    const assetUrl = String(node.properties?.src ?? "");

    const placeholder: Element = {
      type: "element",
      tagName: "div",
      properties: {
        className: ["drawio-asset"],
        dataAssetUrl: assetUrl,
      },
      children: [],
    };

    (parent.children as Element[]).splice(index, 1, placeholder);
  });

  return tree;
}

function isDrawioCodeNode(node: Element): boolean {
  if (node.tagName !== "code") return false;
  const classes = (node.properties?.className ?? []) as string[];
  // language-drawio — explicit draw.io code fence
  if (classes.includes("language-drawio")) return true;
  // language-xml with data-drawio marker (set by author via meta string)
  if (classes.includes("language-xml") && node.properties?.dataDrawio) return true;
  return false;
}

function isDrawioImgNode(node: Element): boolean {
  if (node.tagName !== "img") return false;
  const src = String(node.properties?.src ?? "");
  return src.endsWith(".drawio");
}

export const drawioPlugin: PipelinePlugin = {
  name: "drawio",
  transform: transformDrawio as (
    tree: import("unist").Node,
    context: PipelineContext,
  ) => import("unist").Node,
};
