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
    // 046: independent from `scopes` — which content spaces this key may
    // read. Checked in `can()` via spaceAllowedForKey(), never in roleAllows().
    spaceAccess: z.array(z.enum(['wiki', 'raw', 'generated'])),
  }),
]);

export type Actor = z.infer<typeof actorSchema>;

export type PermCtx = {
  actor: Actor;
};

/** 022: space kinds gate whole action families before role evaluation. */
export type SpaceKind = 'wiki' | 'raw' | 'generated';

/** Registered pages require any signed-in account; restricted pages are admin-only. */
export type PageVisibility = 'public' | 'registered' | 'restricted';

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
  | 'attach_file'
  | 'manage_users'
  | 'manage_storage'
  | 'manage_preferences'
  | 'manage_ai'
  | 'manage_transfers'
  | 'manage_translations'
  | 'manage_appearance'
  | 'manage_tags'
  | 'manage_request_logs'
  | 'manage_static_site'
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
  | { kind: 'tags' }
  | { kind: 'request_logs' }
  | { kind: 'static_site' };

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
  'ai.image': ['use_ai_image_generation'],
  // 034: deliberately NOT added to `create`/`edit`'s mappings — an API key
  // must hold this scope specifically to attach files, independent of its
  // content create/edit permissions (spec FR-007).
  attachments: ['attach_file'],
};

function actionAllowedByScope(actor: Extract<Actor, { kind: 'api_key' }>, action: Action): boolean {
  return actor.scopes.some((scope) => scopeToActions[scope].includes(action));
}

/**
 * 046: actions this grant gates. Writes to raw/generated are already fully
 * gated by `roleAllows`'s space-kind branches (admin-only, same for session
 * and api_key actors) — spaceAccess only narrows *default read visibility*,
 * so it must never additionally block an otherwise-authorized write.
 */
const SPACE_GATED_READ_ACTIONS: readonly Action[] = ['read', 'read_draft'];

/**
 * 046: per-key content-space allow-list, independent of `scopes` and of
 * `roleAllows`'s space-kind branches (which govern session/UI users). `wiki`
 * is always implicitly allowed. `raw`/`generated` reads require both that the
 * key was granted the space at creation *and* that the owner is still an
 * admin today — mirroring the existing scope ∩ role intersection so a key
 * doesn't keep raw/generated access after its owner is demoted.
 */
function spaceAllowedForKey(actor: Extract<Actor, { kind: 'api_key' }>, action: Action, spaceKind?: SpaceKind): boolean {
  if (!spaceKind || spaceKind === 'wiki') return true;
  if (!SPACE_GATED_READ_ACTIONS.includes(action)) return true;
  return actor.role === 'admin' && actor.spaceAccess.includes(spaceKind);
}

function roleAllows(
  action: Action,
  role: 'admin' | 'editor' | 'reader' | 'anonymous',
  opts: { isAuthor?: boolean; anonymousRead?: boolean; spaceKind?: SpaceKind; visibility?: PageVisibility },
): boolean {
  const { isAuthor = false, spaceKind, visibility = 'public' } = opts;

  // Raw remains append-only and generated remains admin-curated. Public reads
  // are deliberately evaluated separately: page visibility, not space kind,
  // determines whether an already-published document may be read anonymously.
  if (spaceKind === 'raw') {
    if (
      action === 'edit' ||
      action === 'delete' ||
      action === 'publish' ||
      action === 'read_draft' ||
      action === 'attach_file'
    ) {
      return false;
    }
    if (action === 'create') return role === 'admin';
    if (action === 'read' && visibility === 'restricted') return role === 'admin';
    if (action === 'read' && visibility === 'registered') return role !== 'anonymous';
  }
  if (
    spaceKind === 'generated' &&
    (action === 'read_draft' ||
      action === 'create' ||
      action === 'edit' ||
      action === 'publish' ||
      action === 'delete' ||
      action === 'attach_file')
  ) {
    return role === 'admin';
  }
  if (
    visibility === 'restricted' &&
    (action === 'read' || action === 'read_draft' || action === 'edit' || action === 'attach_file')
  ) {
    return role === 'admin';
  }

  switch (action) {
    case 'read':
      // `anonymous_read` is retained as compatibility state for old spaces,
      // but cannot veto an explicit page-level public decision.
      return visibility === 'public' || role !== 'anonymous';
    case 'read_draft':
      if (role === 'admin') return true;
      if (role === 'anonymous' || role === 'reader') return false;
      return isAuthor;
    case 'create':
    case 'edit':
    case 'attach_file':
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
    case 'manage_request_logs':
      return role === 'admin';
    case 'manage_static_site':
      // 031: publishing makes wiki content available at a public address under
      // the deployment's own name. No API key scope maps to it — this is
      // deliberately session-admin only, so a key issued for storage or
      // transfers can never publish the wiki to the internet.
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
      action === 'manage_request_logs' ||
      action === 'manage_static_site' ||
      action === 'use_ai_text_optimization'
    ) {
      return false;
    }
    if (!actionAllowedByScope(actor, action)) return false;
    if (!spaceAllowedForKey(actor, action, spaceKind)) return false;
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
  spaceAccess: SpaceKind[] = ['wiki'],
): PermCtx {
  return { actor: { kind: 'api_key', userId, role, scopes, keyId, spaceAccess } };
}

export function getActorUserId(ctx: PermCtx): string | null {
  return ctx.actor.kind === 'user' || ctx.actor.kind === 'api_key' ? ctx.actor.userId : null;
}
