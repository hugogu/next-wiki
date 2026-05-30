import { visit } from "unist-util-visit";
import { eq, and, ne } from "drizzle-orm";
import type { Root, Element } from "hast";
import type { PipelineContext, PipelinePlugin } from "../index";
import { getDb } from "@/server/db/client";
import { pages, spaces } from "@/server/db/schema/wiki";

/**
 * Internal-links plugin — validates wiki-internal hyperlinks and marks them.
 *
 * Internal link definition:
 *   - href starts with "/" but NOT "//" (protocol-relative)
 *   - href is a relative path (no scheme, starts with "." or bare path)
 *
 * For each internal link the plugin:
 *   1. Parses the target spaceKey and path from the href.
 *   2. Queries the DB (read-only) to check whether the target page exists
 *      and is not deleted.
 *   3. Annotates the <a> element:
 *      - data-link-valid="true"   if the page exists
 *      - data-link-valid="false"  + class="broken-link" if it does not
 *
 * External links (http://, https://, mailto:, etc.) are left untouched.
 *
 * FR-026: The collected link metadata is attached to the root node so the
 * save-page hook can persist the data into the page_links table.
 */
async function transformInternalLinks(tree: Root, context: PipelineContext): Promise<Root> {
  // Collect all <a> nodes for batch processing.
  const anchors: Array<{ node: Element }> = [];

  visit(tree, "element", (node: Element) => {
    if (node.tagName === "a") {
      anchors.push({ node });
    }
  });

  if (anchors.length === 0) return tree;

  // Separate internal from external links.
  const internalAnchors = anchors.filter(({ node }) =>
    isInternalHref(String(node.properties?.href ?? "")),
  );

  if (internalAnchors.length === 0) return tree;

  // Batch-validate all internal targets. Group by spaceKey to minimise queries.
  const db = getDb();

  // Build a map of spaceKey -> Set<targetPath> for distinct lookups.
  const lookupMap = new Map<string, Set<string>>();
  for (const { node } of internalAnchors) {
    const href = String(node.properties?.href ?? "");
    const parsed = parseInternalHref(href, context.spaceKey);
    if (!parsed) continue;
    const paths = lookupMap.get(parsed.spaceKey) ?? new Set();
    paths.add(parsed.targetPath);
    lookupMap.set(parsed.spaceKey, paths);
  }

  // For each spaceKey, look up the space id then check pages.
  const validSet = new Set<string>(); // key: `${spaceKey}::${targetPath}`

  for (const [spaceKey, targetPaths] of lookupMap) {
    // Look up space by key.
    const spaceRows = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.key, spaceKey))
      .limit(1);

    if (spaceRows.length === 0) continue; // unknown space — all paths broken

    const spaceId = spaceRows[0]!.id;

    // Check each target path in the space.
    for (const targetPath of targetPaths) {
      const pageRows = await db
        .select({ id: pages.id })
        .from(pages)
        .where(
          and(
            eq(pages.spaceId, spaceId),
            eq(pages.path, targetPath),
            ne(pages.status, "deleted"),
          ),
        )
        .limit(1);

      if (pageRows.length > 0) {
        validSet.add(`${spaceKey}::${targetPath}`);
      }
    }
  }

  // Annotate each anchor.
  for (const { node } of internalAnchors) {
    const href = String(node.properties?.href ?? "");
    const parsed = parseInternalHref(href, context.spaceKey);

    if (!parsed) {
      // Could not parse — leave unmodified.
      continue;
    }

    const key = `${parsed.spaceKey}::${parsed.targetPath}`;
    const isValid = validSet.has(key);

    const existingClasses = (node.properties?.className ?? []) as string[];

    node.properties = {
      ...node.properties,
      dataLinkValid: isValid ? "true" : "false",
      ...(isValid
        ? {}
        : { className: [...existingClasses, "broken-link"] }),
    };
  }

  return tree;
}

/**
 * Returns true when href is an internal wiki link.
 * Internal = starts with "/" (but not "//") OR is a relative path.
 * External = has a scheme (http:, https:, mailto:, etc.) or is "//" relative.
 */
function isInternalHref(href: string): boolean {
  if (!href) return false;
  // Protocol-relative or anchors are not internal wiki links.
  if (href.startsWith("//") || href.startsWith("#")) return false;
  // External schemes.
  if (/^[a-z][a-z0-9+\-.]*:/i.test(href)) return false;
  // Root-relative path (starts with /).
  if (href.startsWith("/")) return true;
  // Relative path (starts with . or is a bare path segment).
  return !href.includes(":");
}

type ParsedHref = {
  spaceKey: string;
  targetPath: string;
};

/**
 * Parse an internal href into { spaceKey, targetPath }.
 *
 * Root-relative: /space-key/some/path  → spaceKey="space-key", targetPath="some/path"
 * Relative:      ./relative  or  ../up/down  — resolved against context.spaceKey + "/"
 *
 * Returns null if the href cannot be meaningfully parsed.
 */
function parseInternalHref(href: string, contextSpaceKey: string): ParsedHref | null {
  // Strip query string and hash.
  const bare = href.split("?")[0]?.split("#")[0] ?? "";

  if (bare.startsWith("/")) {
    // Root-relative: /spaceKey/rest/of/path
    const parts = bare.replace(/^\/+/, "").split("/");
    const spaceKey = parts[0];
    if (!spaceKey) return null;
    const targetPath = parts.slice(1).join("/") || "/";
    return { spaceKey, targetPath };
  }

  // Relative path — resolve against the current space root.
  // We treat all relative links as being within the same space.
  const normalized = bare.replace(/^\.\//, "").replace(/^\//, "");
  if (!normalized) return null;

  return { spaceKey: contextSpaceKey, targetPath: normalized };
}

export const internalLinksPlugin: PipelinePlugin = {
  name: "internal-links",
  transform: transformInternalLinks as (
    tree: import("unist").Node,
    context: PipelineContext,
  ) => Promise<import("unist").Node>,
};
