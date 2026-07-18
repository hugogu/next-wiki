import { z } from 'zod';
import { apiKeyScopeSchema, type ApiKeyScope } from '@next-wiki/shared';

export const actorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('anonymous') }),
  z.object({
    kind: z.literal('user'),
    userId: z.string(),
    role: z.enum(['admin', 'editor', 'reader']),
  }),
  z.object({
    kind: z.literal('api_key'),
    userId: z.string(),
    role: z.enum(['admin', 'editor', 'reader']),
    scopes: z.array(apiKeyScopeSchema),
    keyId: z.string(),
  }),
]);

export type Actor = z.infer<typeof actorSchema>;

export type PermCtx = {
  actor: Actor;
};

/** 022: space kinds gate whole action families before role evaluation. */
export type SpaceKind = 'wiki' | 'raw' | 'generated';

/** 022: restricted pages are admin-only for read/read_draft/edit. */
export type PageVisibility = 'public' | 'restricted';

export type CanOptions = {
  isAuthor?: boolean;
  anonymousRead?: boolean;
  spaceKind?: SpaceKind;
  visibility?: PageVisibility;
};

type SpacePermissionSource = {
  kind: SpaceKind;
  anonymousRead: boolean;
};

type PagePermissionSource = {
  visibility: PageVisibility;
};

/** Build permission inputs from the resolved space rather than call-site defaults. */
export function spacePermissionOptions(space: SpacePermissionSource): Pick<CanOptions, 'anonymousRead' | 'spaceKind'> {
  return { anonymousRead: space.anonymousRead, spaceKind: space.kind };
}

/** Include concrete page visibility whenever a permission targets that page. */
export function pagePermissionOptions(
  space: SpacePermissionSource,
  page: PagePermissionSource,
  options: Omit<CanOptions, 'anonymousRead' | 'spaceKind' | 'visibility'> = {},
): CanOptions {
  return { ...spacePermissionOptions(space), visibility: page.visibility, ...options };
}

export type Action =
  | 'read'
  | 'read_draft'
  | 'create'
  | 'edit'
  | 'publish'
  | 'delete'
  | 'manage_users'
  | 'manage_storage'
  | 'manage_preferences'
  | 'manage_ai'
  | 'manage_transfers'
  | 'manage_translations'
  | 'manage_appearance'
  | 'manage_tags'
  | 'use_ai_search'
  | 'use_ai_qa'
  | 'use_ai_text_optimization'
  | 'use_ai_image_generation';

export type Resource =
  | { kind: 'page_list' }
  | { kind: 'page'; pageId: string }
  | { kind: 'revision'; pageId: string; version: number }
  | { kind: 'users' }
  | { kind: 'storage' }
  | { kind: 'preferences' }
  | { kind: 'ai_settings' }
  | { kind: 'ai_action'; actionId: string }
  | { kind: 'ai_index'; generationId?: string }
  | { kind: 'ai_page'; pageId?: string }
  | { kind: 'transfers' }
  | { kind: 'translations' }
  | { kind: 'appearance' }
  | { kind: 'tags' };

const scopeToActions: Record<ApiKeyScope, Action[]> = {
  view: ['read', 'read_draft'],
  create: ['create'],
  edit: ['edit', 'publish'],
  delete: ['delete'],
  share: [],
  run: [],
  storage: ['manage_storage'],
  preferences: ['manage_preferences'],
  transfers: ['manage_transfers'],
  manage_tags: ['manage_tags'],
  'ai.read': ['use_ai_search', 'use_ai_qa'],
};

function actionAllowedByScope(actor: Extract<Actor, { kind: 'api_key' }>, action: Action): boolean {
  return actor.scopes.some((scope) => scopeToActions[scope].includes(action));
}

function roleAllows(
  action: Action,
  role: 'admin' | 'editor' | 'reader' | 'anonymous',
  opts: { isAuthor?: boolean; anonymousRead?: boolean; spaceKind?: SpaceKind; visibility?: PageVisibility },
): boolean {
  const { isAuthor = false, anonymousRead = true, spaceKind, visibility = 'public' } = opts;

  // 022: the raw space is an append-only evidence store — edits, deletes,
  // publishes, and draft reads are denied for EVERY actor (deny before allow);
  // reads and creates are admin-only. The generated space is admin-curated.
  if (spaceKind === 'raw') {
    if (action === 'edit' || action === 'delete' || action === 'publish' || action === 'read_draft') {
      return false;
    }
    if (action === 'read' || action === 'create') return role === 'admin';
  }
  if (
    spaceKind === 'generated' &&
    (action === 'read' ||
      action === 'read_draft' ||
      action === 'create' ||
      action === 'edit' ||
      action === 'publish' ||
      action === 'delete')
  ) {
    return role === 'admin';
  }
  if (visibility === 'restricted' && (action === 'read' || action === 'read_draft' || action === 'edit')) {
    return role === 'admin';
  }

  switch (action) {
    case 'read':
      return role !== 'anonymous' || anonymousRead;
    case 'read_draft':
      if (role === 'admin') return true;
      if (role === 'anonymous' || role === 'reader') return false;
      return isAuthor;
    case 'create':
    case 'edit':
      return role === 'editor' || role === 'admin';
    case 'publish':
      if (role === 'admin') return true;
      return isAuthor;
    case 'delete':
      if (role === 'admin') return true;
      return isAuthor;
    case 'manage_users':
      return role === 'admin';
    case 'manage_storage':
      return role === 'admin';
    case 'manage_preferences':
      // Any authenticated user may manage their own preferences (self only —
      // the resource is always the actor's own preferences).
      return role !== 'anonymous';
    case 'manage_ai':
    case 'manage_transfers':
    case 'manage_translations':
    case 'manage_appearance':
      return role === 'admin';
    case 'manage_tags':
      // Tags are shared editorial vocabulary. Editors may curate it when a
      // session/API key carries the explicit manage_tags capability; readers
      // remain read-only and other administrative surfaces remain admin-only.
      return role === 'editor' || role === 'admin';
    case 'use_ai_search':
    case 'use_ai_qa':
      return role !== 'anonymous';
    case 'use_ai_text_optimization':
    case 'use_ai_image_generation':
      return role === 'editor' || role === 'admin';
    default:
      return false;
  }
}

/**
 * Permission chokepoint for the whole app.
 *
 * For API key actors, permission is the intersection of the key's scopes and
 * the owner's role permissions (scope ∩ role). For user/anonymous actors,
 * resolution is role-based + authorship + the space-level anonymous_read flag.
 */
export function can(
  ctx: PermCtx,
  action: Action,
  resource: Resource,
  opts: CanOptions = {},
): boolean {
  const { actor } = ctx;
  const { isAuthor = false, anonymousRead = true, spaceKind, visibility } = opts;

  if (actor.kind === 'api_key') {
    // manage_users is never allowed via API key (no scope maps to it).
    // use_ai_search and use_ai_qa are now permitted when the api_key has the
    // 'ai.read' scope (see ai-permissions.test.ts for the role ∩ scope matrix).
    if (
      action === 'manage_users' ||
      action === 'manage_ai' ||
      action === 'manage_translations' ||
      action === 'manage_appearance' ||
      action === 'use_ai_text_optimization' ||
      action === 'use_ai_image_generation'
    ) {
      return false;
    }
    if (!actionAllowedByScope(actor, action)) return false;
    return roleAllows(action, actor.role, { isAuthor, anonymousRead, spaceKind, visibility });
  }

  const role = actor.kind === 'user' ? actor.role : 'anonymous';
  return roleAllows(action, role, { isAuthor, anonymousRead, spaceKind, visibility });
}

export function buildAnonymousCtx(): PermCtx {
  return { actor: { kind: 'anonymous' } };
}

export function buildUserCtx(userId: string, role: 'admin' | 'editor' | 'reader'): PermCtx {
  return { actor: { kind: 'user', userId, role } };
}

export function buildApiKeyCtx(
  userId: string,
  role: 'admin' | 'editor' | 'reader',
  scopes: ApiKeyScope[],
  keyId: string,
): PermCtx {
  return { actor: { kind: 'api_key', userId, role, scopes, keyId } };
}

export function getActorUserId(ctx: PermCtx): string | null {
  return ctx.actor.kind === 'user' || ctx.actor.kind === 'api_key' ? ctx.actor.userId : null;
}
