'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { translationLanguageName } from '@next-wiki/shared';
import { CheckIcon, GlobeIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import { getConfiguredSpaceHref, getPageHref, getTranslatedPageHref } from '@/lib/path';
import { readReadingLanguage, writeReadingLanguage } from '@/lib/reading-language';
import { ToolbarMenu } from './ToolbarMenu';
import type { PageContext } from './types';

/** Address of one language version of the page; `null` is the original. */
function versionHref(sourcePath: string, routePrefix: string | undefined, locale: string | null): string {
  if (routePrefix) return getConfiguredSpaceHref(routePrefix, sourcePath, locale);
  return locale ? getTranslatedPageHref(locale, sourcePath) : getPageHref(sourcePath);
}

function LanguageLink({
  href,
  label,
  active,
  onSelect,
}: {
  href: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between gap-md rounded-md px-md py-sm text-sm transition-colors hover:bg-surface-elevated ${
        active ? 'font-medium text-primary' : 'text-foreground'
      }`}
    >
      <span>{label}</span>
      {active && <CheckIcon width={16} height={16} aria-hidden="true" />}
    </Link>
  );
}

/**
 * Toolbar button for moving between a page and its translations. It also
 * carries out the reader's remembered choice: opening the original of a page
 * that has a version in the language chosen last switches to that version, and a
 * page without one stays as written.
 *
 * Only the original's own address is switched. A link straight to a language is
 * an explicit choice and is left alone, and the switch replaces the history
 * entry so that Back does not land on the page that just redirected.
 */
export function ReaderLanguageSwitcher({ pageContext }: { pageContext: NonNullable<PageContext> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { sourcePath, routePrefix } = pageContext;
  const viewing = pageContext.currentLocale ?? null;
  // A string, so the effect below re-runs for a different page but not merely
  // because the same list arrived as a new array.
  const localesKey = (pageContext.translationLocales ?? []).join(',');

  useEffect(() => {
    if (!sourcePath || viewing || !localesKey) return;
    const preferred = readReadingLanguage();
    if (!preferred || !localesKey.split(',').includes(preferred)) return;
    // Keep what the reader came for: a query string or an anchor in the link.
    const { search, hash } = window.location;
    router.replace(`${versionHref(sourcePath, routePrefix, preferred)}${search}${hash}`);
  }, [router, sourcePath, routePrefix, viewing, localesKey]);

  const locales = localesKey ? localesKey.split(',') : [];
  if (!sourcePath || locales.length === 0) return null;

  return (
    <ToolbarMenu label={t('page.header.language')} icon={<GlobeIcon />}>
      <LanguageLink
        href={versionHref(sourcePath, routePrefix, null)}
        label={t('page.header.original')}
        active={!viewing}
        onSelect={() => writeReadingLanguage(null)}
      />
      {locales.map((locale) => (
        <LanguageLink
          key={locale}
          href={versionHref(sourcePath, routePrefix, locale)}
          label={translationLanguageName(locale)}
          active={viewing === locale}
          onSelect={() => writeReadingLanguage(locale)}
        />
      ))}
    </ToolbarMenu>
  );
}
