import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { pageRevisions, pages, permissionRules, spaces } from "@/server/db/schema/wiki";
import type { PermissionContext } from "@/server/services/permissions/context";
import { assertPermission } from "@/server/services/permissions/engine";
import { NotFoundError } from "@next-wiki/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiffLineType = "added" | "removed" | "unchanged";

export type DiffLine = {
  type: DiffLineType;
  content: string;
};

export type RevisionDiff = {
  revisionIdA: string;
  revisionIdB: string;
  lines: DiffLine[];
};

// ---------------------------------------------------------------------------
// LCS-based line diff
// ---------------------------------------------------------------------------

/**
 * Compute the Longest Common Subsequence length table for two line arrays.
 * Space-optimised rolling two-row approach.
 */
function lcsLengths(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Full table for backtracking
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack the LCS table to produce a unified diff of two line arrays.
 */
function buildDiff(a: string[], b: string[]): DiffLine[] {
  const dp = lcsLengths(a, b);
  const result: DiffLine[] = [];

  let i = a.length;
  let j = b.length;

  // Stack to reverse the back-tracking order
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ type: "unchanged", content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "added", content: b[j - 1] });
      j--;
    } else {
      stack.push({ type: "removed", content: a[i - 1] });
      i--;
    }
  }

  // Reverse (backtracking gives reverse order)
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

/**
 * Compute a line-level diff between two revisions.
 * Both revisions must belong to the same page; the actor must have read access.
 */
export async function diffRevisions(
  revisionIdA: string,
  revisionIdB: string,
  actor: PermissionContext,
): Promise<RevisionDiff> {
  const db = getDb();

  const [revA, revB] = await Promise.all([
    db.select().from(pageRevisions).where(eq(pageRevisions.id, revisionIdA)).limit(1),
    db.select().from(pageRevisions).where(eq(pageRevisions.id, revisionIdB)).limit(1),
  ]);

  const revisionA = revA[0];
  const revisionB = revB[0];

  if (!revisionA) throw new NotFoundError("PageRevision", revisionIdA);
  if (!revisionB) throw new NotFoundError("PageRevision", revisionIdB);

  if (revisionA.pageId !== revisionB.pageId) {
    throw new NotFoundError("PageRevision", `${revisionIdA} and ${revisionIdB} belong to different pages`);
  }

  const pageId = revisionA.pageId;

  // Load the page for permission context
  const pageRows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = pageRows[0];
  if (!page || page.status === "deleted") {
    throw new NotFoundError("Page", pageId);
  }

  // Load permission rules and space for access check
  const [spaceRows, ruleRows] = await Promise.all([
    db.select().from(spaces).where(eq(spaces.id, page.spaceId)).limit(1),
    db.select().from(permissionRules).where(
      or(
        and(eq(permissionRules.resourceType, "page"), eq(permissionRules.resourceId, pageId)),
        and(eq(permissionRules.resourceType, "space"), eq(permissionRules.resourceId, page.spaceId)),
      ),
    ),
  ]);
  const space = spaceRows[0];
  const permRules = ruleRows.map((r) => ({
    subjectType: r.subjectType as "user" | "group",
    subjectId: r.subjectId,
    resourceType: r.resourceType as "page" | "space",
    resourceId: r.resourceId,
    action: r.action as "read",
    effect: r.effect as "allow" | "deny",
  }));

  assertPermission({
    actor,
    action: "read",
    resourceType: "page",
    resourceId: pageId,
    rules: permRules,
    spaceDefaultAllowed: space?.isPublicByDefault ?? false,
    globalDefaultAllowed: actor.isAdmin,
  });

  // Compute line diff
  const linesA = revisionA.sourceContent.split("\n");
  const linesB = revisionB.sourceContent.split("\n");
  const lines = buildDiff(linesA, linesB);

  return {
    revisionIdA,
    revisionIdB,
    lines,
  };
}
