import { z } from 'zod';

export const actorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('anonymous') }),
  z.object({
    kind: z.literal('user'),
    userId: z.string(),
    role: z.enum(['admin', 'editor', 'reader']),
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

/**
 * Permission chokepoint for the whole app.
 *
 * For the MVP read slice, resolution is role-based + authorship + the
 * space-level anonymous_read flag. Per-page overrides are deferred; adding
 * them only requires extending this function.
 */
export function can(
  ctx: PermCtx,
  action: Action,
  resource: Resource,
  opts: { isAuthor?: boolean; anonymousRead?: boolean } = {},
): boolean {
  const { actor } = ctx;
  const { isAuthor = false, anonymousRead = true } = opts;

  const role = actor.kind === 'user' ? actor.role : 'anonymous';

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

    case 'publish': {
      // Per data-model.md permission matrix:
      //   - admin → always allowed
      //   - author-of-draft → allowed (editors become authors by creating a
      //     draft; readers can never author because they lack 'create')
      //   - everyone else → denied
      if (role === 'admin') return true;
      return isAuthor;
    }

    case 'delete': {
      // Admin can delete any page; authors can delete their own pages.
      if (role === 'admin') return true;
      return isAuthor;
    }

    case 'manage_users':
      return role === 'admin';

    default:
      return false;
  }
}

export function buildAnonymousCtx(): PermCtx {
  return { actor: { kind: 'anonymous' } };
}

export function buildUserCtx(userId: string, role: 'admin' | 'editor' | 'reader'): PermCtx {
  return { actor: { kind: 'user', userId, role } };
}
