'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Actor } from '@/server/permissions';
import { useTranslation } from '@/i18n/client';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { apiPost } from '@/lib/api/client';
import { UserIcon, LogOutIcon, LogInIcon, ShieldIcon, CodeIcon, ChevronDownIcon } from '@/components/icons';

/**
 * Footer control for the sidebar (bottom-left of the page). Collects the
 * global entry points that used to live in the top-right of the header —
 * user settings / sign-in-out, the admin console, and the API docs — into a
 * single popup that opens upward. Keeping them here declutters the header so
 * it can show only page-contextual actions, and the popup rides inside the
 * mobile navigation drawer so it stays reachable on small screens.
 */
export function NavFooterMenu({ user, onNavigate }: { user: Actor; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isSignedIn = user.kind === 'user';
  const isAdmin = isSignedIn && user.role === 'admin';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={ref} className="relative border-t border-border p-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-sm rounded-md px-md py-sm text-sm transition-colors ${
          open ? 'bg-surface-elevated text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-elevated'
        }`}
      >
        <UserIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">
          {isSignedIn ? t('userCenter.title') : t('auth.login.button.submit')}
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-sm right-sm mb-1 bg-surface border border-border rounded-lg shadow-lg py-xs z-50"
        >
          {isSignedIn && (
            <MenuLink
              href="/user-center/profile"
              icon={<UserIcon className="h-4 w-4" />}
              active={pathname.startsWith('/user-center')}
              onClick={close}
            >
              {t('userCenter.nav.settings')}
            </MenuLink>
          )}

          {isAdmin && (
            <MenuLink
              href="/admin/users"
              icon={<ShieldIcon className="h-4 w-4" />}
              active={pathname.startsWith('/admin')}
              onClick={close}
            >
              {t('page.header.admin')}
            </MenuLink>
          )}

          <MenuLink href="/api-docs" icon={<CodeIcon className="h-4 w-4" />} active={pathname.startsWith('/api-docs')} onClick={close}>
            {t('layout.header.apiDocs')}
          </MenuLink>

          <div className="my-xs border-t border-border" />

          <div className="flex items-center justify-between px-md py-sm">
            <span className="text-sm text-muted">{t('theme.label')}</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between px-md py-sm">
            <span className="text-sm text-muted">{t('language.label')}</span>
            <LanguageSwitcher />
          </div>

          <div className="my-xs border-t border-border" />

          {isSignedIn ? (
            <button
              type="button"
              onClick={async () => {
                await apiPost('/api/auth/logout', {});
                window.location.href = '/';
              }}
              className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left text-sm text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <LogOutIcon className="h-4 w-4" />
              <span>{t('auth.logout.button.submit')}</span>
            </button>
          ) : (
            <Link
              href="/auth/login"
              onClick={close}
              className="flex items-center gap-sm rounded-md px-md py-sm text-sm text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <LogInIcon className="h-4 w-4" />
              <span>{t('auth.login.button.submit')}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  active,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-sm rounded-md px-md py-sm text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary font-medium' : 'text-muted hover:text-foreground hover:bg-surface-elevated'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
