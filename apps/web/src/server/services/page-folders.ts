import { eq, like, or } from 'drizzle-orm';
import * as schema from '@/server/db/schema';

/**
 * Matches the page at `pathPrefix` and every page below it.
 *
 * `pathSchema` allows underscores, which PostgreSQL `LIKE` treats as
 * single-character wildcards — escape them so a prefix like `foo_bar` only
 * matches that exact subtree, not `fooXbar/...`. Backslash is the default LIKE
 * escape character; escape it first so a hostile path can't smuggle a partial
 * wildcard past us.
 */
export function pathInFolder(pathPrefix: string) {
  const escapedPrefix = pathPrefix.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return or(
    eq(schema.pages.path, pathPrefix),
    like(schema.pages.path, `${escapedPrefix}/%`),
  );
}
