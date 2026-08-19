'use client';

import { LockIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';

export function DemoReadonlyBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center justify-center gap-xs border-b border-warning/40 bg-warning/10 px-md py-xs text-xs text-warning">
      <LockIcon className="h-3.5 w-3.5" />
      {t('admin.demoReadonly.banner')}
    </div>
  );
}
