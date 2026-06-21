'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { useTranslation } from '@/i18n/client';

export type TransferTab = 'exports' | 'archives' | 'wikijs' | 'history';

const TABS: TransferTab[] = ['exports', 'archives', 'wikijs', 'history'];

export function TransferAdminTabs({
  selected,
  children,
}: {
  selected: TransferTab;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useTranslation();
  return (
    <SettingsTabs
      tabs={TABS.map((id) => ({ id, label: t(`admin.transfers.tabs.${id}`) }))}
      selected={selected}
      onSelect={(tab) => {
        const next = new URLSearchParams(params);
        next.set('tab', tab);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {children}
    </SettingsTabs>
  );
}
