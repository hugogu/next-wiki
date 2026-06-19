'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Actor } from '@/server/permissions';
import { useTranslation } from '@/i18n/client';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { apiPost } from '@/lib/api/client';
import { UserIcon, LogOutIcon, LogInIcon } from '@/components/icons';

export function UserDropdown({ user }: { user: Actor }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isSignedIn = user.kind === 'user';

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('userCenter.title')}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
          open ? 'bg-surface-elevated text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-elevated'
        }`}
      >
        <UserIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg py-xs z-50">
          {isSignedIn ? (
            <>
              <DropdownLink href="/user-center/profile" icon={<UserIcon className="w-4 h-4" />} active={pathname.startsWith('/user-center')} onClick={() => setOpen(false)}>
                {t('userCenter.nav.settings')}
              </DropdownLink>

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

              <form
                action="/api/auth/logout"
                method="POST"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiPost('/api/auth/logout', {});
                  window.location.href = '/';
                }}
              >
                <button
                  type="submit"
                  className="flex items-center w-full gap-sm px-md py-sm text-sm text-left text-muted hover:text-foreground hover:bg-surface-elevated transition-colors rounded-md"
                >
                  <LogOutIcon className="w-4 h-4" />
                  <span>{t('auth.logout.button.submit')}</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">{t('theme.label')}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between px-md py-sm">
                <span className="text-sm text-muted">{t('language.label')}</span>
                <LanguageSwitcher />
              </div>

              <div className="my-xs border-t border-border" />

              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-sm px-md py-sm text-sm text-muted hover:text-foreground hover:bg-surface-elevated transition-colors rounded-md"
              >
                <LogInIcon className="w-4 h-4" />
                <span>{t('auth.login.button.submit')}</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownLink({
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
      className={`flex items-center gap-sm px-md py-sm text-sm transition-colors rounded-md ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted hover:text-foreground hover:bg-surface-elevated'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
