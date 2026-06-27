'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

/**
 * Build an href to the same path with `pageParam=target`, preserving every
 * other existing query param (filters, tab, q, …). Pure for testability.
 */
export function buildPageHref(
  pathname: string,
  current: URLSearchParams,
  pageParam: string,
  target: number,
): string {
  const next = new URLSearchParams(current);
  next.set(pageParam, String(target));
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * The window of nearby page numbers to render around the current page, clamped
 * to `[1, totalPages]`. `span` controls how many neighbours show on each side.
 */
export function pageWindow(currentPage: number, totalPages: number, span = 2): number[] {
  const start = Math.max(1, currentPage - span);
  const end = Math.min(totalPages, currentPage + span);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);
  return pages;
}

const ITEM_BASE =
  'inline-flex h-8 min-w-8 items-center justify-center gap-xs rounded-md border border-border px-sm text-sm';

function Control({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={`${ITEM_BASE} cursor-default text-muted opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${ITEM_BASE} text-foreground hover:bg-surface-elevated`}>
      {children}
    </Link>
  );
}

export interface PaginationProps {
  /** 1-based, already clamped by the server. */
  currentPage: number;
  /** Total page count (totalItems / pageSize). */
  totalPages: number;
  /** URL search param holding the page number. Defaults to `page`. */
  pageParam?: string;
}

/**
 * Unified, URL-driven pagination control (FR-019..FR-024). Reads the current
 * path + query from the URL and renders First / Prev / nearby numbers / Next /
 * Last as links to `?page=N`, preserving all other params. Renders nothing for
 * single-page or empty lists. The page number lives in the URL so refresh, deep
 * link, share, and back/forward all restore the same page.
 */
export function Pagination({ currentPage, totalPages, pageParam = 'page' }: PaginationProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const params = useSearchParams();

  if (totalPages <= 1) return null;

  const href = (target: number) => buildPageHref(pathname, new URLSearchParams(params), pageParam, target);
  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-xs">
      <Control href={href(1)} disabled={isFirst} label={t('pagination.first')}>
        {t('pagination.first')}
      </Control>
      <Control href={href(currentPage - 1)} disabled={isFirst} label={t('pagination.previous')}>
        <ChevronLeftIcon />
        <span>{t('pagination.previous')}</span>
      </Control>
      {pageWindow(currentPage, totalPages).map((page) =>
        page === currentPage ? (
          <span
            key={page}
            aria-current="page"
            className={`${ITEM_BASE} border-primary bg-primary/10 font-medium text-primary`}
          >
            {page}
          </span>
        ) : (
          <Link key={page} href={href(page)} className={`${ITEM_BASE} text-foreground hover:bg-surface-elevated`}>
            {page}
          </Link>
        ),
      )}
      <Control href={href(currentPage + 1)} disabled={isLast} label={t('pagination.next')}>
        <span>{t('pagination.next')}</span>
        <ChevronRightIcon />
      </Control>
      <Control href={href(totalPages)} disabled={isLast} label={t('pagination.last')}>
        {t('pagination.last')}
      </Control>
    </nav>
  );
}
