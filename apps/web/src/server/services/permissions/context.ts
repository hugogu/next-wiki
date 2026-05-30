export type PermissionAction = "read" | "write" | "delete" | "manage" | "execute";
export type ResourceType = "site" | "space" | "page" | "asset" | "ai" | "integration";

export type ActorKind = "user" | "system" | "token";

export type PermissionContext = {
  kind: ActorKind;
  userId: string | null;
  groupIds: string[];
  tokenScopes: string[];
  isAdmin: boolean;
};

export type SystemActorContext = PermissionContext & {
  kind: "system";
  userId: null;
};

// Anonymous reader context — can access publicly permitted resources.
export const anonymousContext = (): PermissionContext => ({
  kind: "user",
  userId: null,
  groupIds: [],
  tokenScopes: [],
  isAdmin: false,
});

// Scoped system context for background jobs — no admin bypass.
export const systemJobContext = (): SystemActorContext => ({
  kind: "system",
  userId: null,
  groupIds: [],
  tokenScopes: ["read", "write"],
  isAdmin: false,
});

export type PermissionRule = {
  subjectType: "user" | "group";
  subjectId: string;
  resourceType: ResourceType;
  resourceId: string | null;
  action: PermissionAction;
  effect: "allow" | "deny";
};
