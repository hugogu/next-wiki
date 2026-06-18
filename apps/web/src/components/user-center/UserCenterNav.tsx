'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n/client';
import { UserIcon, KeyIcon, SlidersIcon, ClipboardListIcon } from '@/components/icons';

const sections = [
  { href: '/user-center/profile', key: 'userCenter.nav.profile', icon: UserIcon },
  { href: '/user-center/preferences', key: 'userCenter.nav.preferences', icon: SlidersIcon },
  { href: '/user-center/api-keys', key: 'userCenter.nav.apiKeys', icon: KeyIcon },
  { href: '/user-center/audit', key: 'userCenter.nav.audit', icon: ClipboardListIcon },
];

export function UserCenterNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav className="w-full md:w-64 shrink-0 md:pr-lg md:border-r border-border">
      <ul className="space-y-1">
        {sections.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-sm px-md py-sm rounded-md transition-colors ${
                  active
                    ? 'bg-primary text-primary-text'
                    : 'text-muted hover:text-foreground hover:bg-surface-elevated'
                }`}
              >
                <Icon />
                <span>{t(key as never)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
