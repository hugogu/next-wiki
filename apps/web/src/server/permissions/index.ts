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

function roleAllows(action: Action, role: 'admin' | 'editor' | 'reader' | 'anonymous', opts: { isAuthor?: boolean; anonymousRead?: boolean }): boolean {
  const { isAuthor = false, anonymousRead = true } = opts;

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
  opts: { isAuthor?: boolean; anonymousRead?: boolean } = {},
): boolean {
  const { actor } = ctx;
  const { isAuthor = false, anonymousRead = true } = opts;

  if (actor.kind === 'api_key') {
    // manage_users is never allowed via API key (no scope maps to it).
    // use_ai_search and use_ai_qa are now permitted when the api_key has the
    // 'ai.read' scope (see ai-permissions.test.ts for the role ∩ scope matrix).
    if (
      action === 'manage_users' ||
      action === 'manage_ai' ||
      action === 'manage_appearance' ||
      action === 'use_ai_text_optimization' ||
      action === 'use_ai_image_generation'
    ) {
      return false;
    }
    if (!actionAllowedByScope(actor, action)) return false;
    return roleAllows(action, actor.role, { isAuthor, anonymousRead });
  }

  const role = actor.kind === 'user' ? actor.role : 'anonymous';
  return roleAllows(action, role, { isAuthor, anonymousRead });
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
