import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'reader']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const revisionStatusEnum = pgEnum('revision_status', ['draft', 'published']);
export const contentTypeEnum = pgEnum('content_type', ['text/markdown']);
export const apiKeyScopeEnum = pgEnum('api_key_scope', [
  'view',
  'create',
  'edit',
  'delete',
  'share',
  'run',
]);
