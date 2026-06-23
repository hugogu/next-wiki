import type { SiteSettingsView } from '@next-wiki/shared';

/**
 * Site footer: copyright plus optional China regulatory filing numbers (ICP /
 * 公安备案), each linked to the official registry. Renders nothing when no
 * footer content is configured.
 */
export function Footer({ site }: { site: SiteSettingsView }) {
  const { footerCopyright, icp, publicSecurity } = site;
  if (!footerCopyright && !icp.number && !publicSecurity.number) return null;

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
      </div>
    </footer>
  );
}
