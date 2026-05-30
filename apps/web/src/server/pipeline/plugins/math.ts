import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import type { PipelineContext, PipelinePlugin } from "../index";

/**
 * Math post-processing plugin.
 *
 * remark-math + rehype-katex already convert $...$ and $$...$$ blocks into
 * rendered KaTeX HTML. This plugin runs after that conversion to:
 *
 * 1. Add aria-label to .katex elements for screen-reader accessibility (FR-038).
 * 2. Mark malformed expressions (.katex-error) with data-math-error="true" and
 *    preserve the original LaTeX source in data-math-source.
 *
 * The data-math-source attribute satisfies the FR-038 requirement that
 * unsupported or un-renderable content is never silently discarded.
 */
function transformMath(tree: Root, _context: PipelineContext): Root {
  let hasMath = false;

  // Quick presence check.
  visit(tree, "element", (node: Element) => {
    if (
      node.tagName === "span" &&
      Array.isArray(node.properties?.className) &&
      (node.properties.className as string[]).some(
        (c) => c === "katex" || c === "katex-display",
      )
    ) {
      hasMath = true;
    }
  });

  if (!hasMath) return tree;

  visit(tree, "element", (node: Element) => {
    const classes = (node.properties?.className ?? []) as string[];

    // Handle error nodes first — they appear as span.katex-error.
    if (node.tagName === "span" && classes.includes("katex-error")) {
      // Extract original source: KaTeX puts it as text content of the error span.
      const source = node.children
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; value: string }).value)
        .join("");

      node.properties = {
        ...node.properties,
        dataMathError: "true",
        dataMathSource: source,
      };
      return;
    }

    // Add aria-label to top-level .katex spans.
    if (node.tagName === "span" && classes.includes("katex")) {
      // KaTeX places the source in a <annotation> child of the MathML subtree.
      // Walk children to find it.
      let source = "";
      visit(node, "element", (child: Element) => {
        if (child.tagName === "annotation" && !source) {
          source = child.children
            .filter((c) => c.type === "text")
            .map((c) => (c as { type: "text"; value: string }).value)
            .join("");
        }
      });

      if (source) {
        node.properties = {
          ...node.properties,
          ariaLabel: source,
          dataMathSource: source,
        };
      }
    }
  });

  return tree;
}

export const mathPlugin: PipelinePlugin = {
  name: "math",
  transform: transformMath as (
    tree: import("unist").Node,
    context: PipelineContext,
  ) => import("unist").Node,
};
