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
  | 'manage_users';

export type Resource =
  | { kind: 'page_list' }
  | { kind: 'page'; pageId: string }
  | { kind: 'revision'; pageId: string; version: number }
  | { kind: 'users' };

const scopeToActions: Record<ApiKeyScope, Action[]> = {
  view: ['read', 'read_draft'],
  create: ['create'],
  edit: ['edit', 'publish'],
  delete: ['delete'],
  share: [],
  run: [],
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
    if (action === 'manage_users') return false;
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
