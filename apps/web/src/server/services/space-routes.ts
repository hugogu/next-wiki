import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';

export type RouteableSpace = {
  id?: string;
  kind: 'wiki' | 'raw' | 'generated';
  routePrefix: string | null;
};

export type ResolvedSpacePrefix = {
  space: typeof schema.spaces.$inferSelect;
  isAlias: boolean;
};

const RESERVED_PREFIXES = new Set([
  'api', 'admin', 'auth', 'edit', 'forbidden', 'h', 'healthz', 'new', 'pages',
  'readyz', 'registered-reader', 's', 'search', 'setup', 'spaces', 'tags', 'user-center',
]);

/** Whether a first URL segment belongs to application routing, not wiki content. */
export function isReservedSpacePrefix(value: string): boolean {
  return RESERVED_PREFIXES.has(normalizeRoutePrefix(value));
}

function builtInPrefix(kind: RouteableSpace['kind']): string {
  return kind === 'wiki' ? 'wiki' : kind;
}

/** Legacy rows safely receive a concrete prefix without mutating history. */
export function effectiveRoutePrefix(space: RouteableSpace): string {
  return space.routePrefix?.trim() || builtInPrefix(space.kind);
}

export function normalizeRoutePrefix(value: string): string {
  return value.trim().toLowerCase();
}

/** Return an actionable validation error; null means the segment is valid. */
export function routePrefixValidationError(value: string): string | null {
  const normalized = normalizeRoutePrefix(value);
  if (!normalized) return 'A route prefix is required.';
  if (normalized.includes('/')) return 'A route prefix must be a single URL segment.';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$|^[a-z0-9]$/.test(normalized)) {
    return 'Use lowercase letters, numbers, and hyphens only.';
  }
  if (isReservedSpacePrefix(normalized) || /^[a-z]{2}$/.test(normalized)) {
    return 'This route prefix is reserved.';
  }
  return null;
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** Canonical public address. Locale, when present, follows the space prefix. */
export function canonicalSpacePath(space: RouteableSpace, path?: string, locale?: string | null): string {
  const segments = [effectiveRoutePrefix(space)];
  if (locale && locale !== 'en') segments.push(encodeURIComponent(locale));
  if (path) segments.push(encodePath(path));
  return `/${segments.filter(Boolean).join('/')}`;
}

export async function resolveSpacePrefix(prefix: string): Promise<ResolvedSpacePrefix | null> {
  const normalized = normalizeRoutePrefix(prefix);
  if (routePrefixValidationError(normalized)) return null;

  const current = await db.query.spaces.findFirst({
    where: eq(schema.spaces.routePrefix, normalized),
  });
  if (current) return { space: current, isAlias: false };

  // Rows created before feature 032 have no persisted prefix. Their safe,
  // deterministic defaults are treated as current until an Admin changes one.
  const legacyDefault = await db.query.spaces.findMany();
  const defaultMatch = legacyDefault.find((space) => !space.routePrefix && effectiveRoutePrefix(space) === normalized);
  if (defaultMatch) return { space: defaultMatch, isAlias: false };

  const alias = await db.query.spaceRouteAliases.findFirst({
    where: eq(schema.spaceRouteAliases.prefix, normalized),
  });
  if (!alias) return null;
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.id, alias.spaceId) });
  return space ? { space, isAlias: true } : null;
}

/** Validate cross-space and alias collisions before a configuration update. */
export async function assertRoutePrefixAvailable(spaceId: string, prefix: string): Promise<string> {
  const normalized = normalizeRoutePrefix(prefix);
  const error = routePrefixValidationError(normalized);
  if (error) throw new DomainError('BAD_REQUEST', error);

  const [current, alias, legacyRows] = await Promise.all([
    db.query.spaces.findFirst({ where: and(eq(schema.spaces.routePrefix, normalized), ne(schema.spaces.id, spaceId)) }),
    db.query.spaceRouteAliases.findFirst({ where: eq(schema.spaceRouteAliases.prefix, normalized) }),
    db.query.spaces.findMany(),
  ]);
  if (current || (alias && alias.spaceId !== spaceId) || legacyRows.some((space) => space.id !== spaceId && !space.routePrefix && effectiveRoutePrefix(space) === normalized)) {
    throw new DomainError('CONFLICT', 'This route prefix is already in use.');
  }
  return normalized;
}

