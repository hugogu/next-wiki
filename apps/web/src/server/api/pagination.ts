/**
 * Server-side pagination convention shared by every paginated list route
 * (FR-019..FR-024, contract: contracts/pagination.md). The page number lives
 * entirely in the URL `page` search param; the server clamps it and computes the
 * DB offset. Pair the result with the <Pagination> UI primitive.
 */

/**
 * Number of pages for a list. An empty list still has a single (empty) page, so
 * the result is never below 1.
 */
export function totalPages(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

/**
 * Parse a `page` search param and clamp it into `[1, max]`. Non-numeric, zero,
 * negative, or fractional inputs fall back to 1; values beyond the last page
 * clamp down to `max`. Never throws (FR-023).
 */
export function clampPage(raw: string | string[] | undefined | null, max: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, Math.max(1, max));
}

export interface Pagination {
  /** 1-based page, clamped into the valid range. */
  page: number;
  pageSize: number;
  /** Row offset for a `limit`/`offset` query. */
  offset: number;
  totalPages: number;
  totalItems: number;
}

/**
 * Resolve URL pagination for a list query: clamp the requested page against the
 * real page count and compute the DB offset. Feed `offset`/`pageSize` to the
 * query and `page`/`totalPages` to <Pagination>.
 */
export function paginate(args: {
  page: string | string[] | undefined | null;
  pageSize: number;
  totalItems: number;
}): Pagination {
  const pages = totalPages(args.totalItems, args.pageSize);
  const page = clampPage(args.page, pages);
  return {
    page,
    pageSize: args.pageSize,
    offset: (page - 1) * args.pageSize,
    totalPages: pages,
    totalItems: args.totalItems,
  };
}
