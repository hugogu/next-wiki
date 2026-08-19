import type { SiteSettingsView } from '@next-wiki/shared';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/server';

const REPO_URL = 'https://github.com/hugogu/next-wiki';

/**
 * Site footer: copyright, optional China regulatory filing numbers (ICP /
 * 公安备案) each linked to the official registry, and a "Powered by" link
 * back to the next-wiki repository.
 */
export function Footer({ site, locale }: { site: SiteSettingsView; locale: Locale }) {
  const { footerCopyright, icp, publicSecurity } = site;
  const t = getDictionary(locale);

  return (
    <footer className="shrink-0 border-t border-border px-lg py-md text-center text-xs text-muted">
      <div className="flex flex-wrap items-center justify-center gap-x-md gap-y-xs">
        {footerCopyright && <span>{footerCopyright}</span>}
        {icp.number && (
          <a
            href={icp.url ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground"
          >
            {icp.number}
          </a>
        )}
        {publicSecurity.number && (
          <a
            href={publicSecurity.url ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground"
          >
            {publicSecurity.number}
          </a>
        )}
        <span>
          {t('layout.footer.poweredBy')}{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hover:text-foreground">
            next-wiki
          </a>
        </span>
      </div>
    </footer>
  );
}
