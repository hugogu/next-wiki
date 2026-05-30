import type { PermissionAction, PermissionContext, PermissionRule, ResourceType } from "./context";
import { ForbiddenError } from "@next-wiki/shared";

type EvaluateParams = {
  actor: PermissionContext;
  action: PermissionAction;
  resourceType: ResourceType;
  resourceId?: string;
  rules: PermissionRule[];
  spaceDefaultAllowed?: boolean;
  globalDefaultAllowed?: boolean;
};

type EvaluationResult = "allow" | "deny" | "inherit";

// Evaluate a single rule against the actor and resource.
function matchRule(
  rule: PermissionRule,
  actor: PermissionContext,
  action: PermissionAction,
  resourceType: ResourceType,
  resourceId: string | undefined,
): boolean {
  if (rule.action !== action) return false;
  if (rule.resourceType !== resourceType) return false;
  // null resourceId means the rule applies to all resources of that type.
  if (rule.resourceId !== null && rule.resourceId !== resourceId) return false;

  if (rule.subjectType === "user") {
    return rule.subjectId === actor.userId;
  }
  if (rule.subjectType === "group") {
    return actor.groupIds.includes(rule.subjectId);
  }
  return false;
}

/**
 * Evaluate whether `actor` may perform `action` on `resource`.
 *
 * Precedence: explicit deny > explicit allow > space default > global default.
 * No hidden admin bypass — admins are modeled through permission rules.
 */
export function evaluatePermission({
  actor,
  action,
  resourceType,
  resourceId,
  rules,
  spaceDefaultAllowed = false,
  globalDefaultAllowed = false,
}: EvaluateParams): EvaluationResult {
  const matched = rules.filter((r) =>
    matchRule(r, actor, action, resourceType, resourceId),
  );

  // Explicit deny wins over everything.
  if (matched.some((r) => r.effect === "deny")) return "deny";

  // Explicit allow next.
  if (matched.some((r) => r.effect === "allow")) return "allow";

  // Fall through to space or global default.
  if (spaceDefaultAllowed) return "allow";
  if (globalDefaultAllowed) return "allow";

  return "deny";
}

/**
 * Assert that `actor` may perform `action`. Throws ForbiddenError otherwise.
 * This is the primary guard used in service methods.
 */
export function assertPermission(params: EvaluateParams): void {
  const result = evaluatePermission(params);
  if (result !== "allow") {
    throw new ForbiddenError(`${params.action} ${params.resourceType}`);
  }
}

/**
 * Convenience check that returns a boolean without throwing.
 */
export function checkPermission(params: EvaluateParams): boolean {
  return evaluatePermission(params) === "allow";
}
