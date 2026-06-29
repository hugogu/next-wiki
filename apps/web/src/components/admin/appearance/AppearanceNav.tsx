'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n/client';

/** Sub-navigation across the appearance admin surfaces (route-based, P10). */
export function AppearanceNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = [
    { href: '/admin/appearance', label: t('admin.appearance.tabs.site') },
    { href: '/admin/appearance/system', label: t('admin.appearance.tabs.system') },
  ];
  return (
    <nav className="flex gap-xs border-b border-border">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`-mb-px border-b-2 px-md py-sm text-sm font-medium ${
              active ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
