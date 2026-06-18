import type { Metadata } from 'next';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { getLocale, getDictionary } from '@/i18n/server';
import { PreferencesForm } from '@/components/user-center/PreferencesForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.preferences.metadataTitle') };
}

export default async function PreferencesPage() {
  const actor = await getCurrentActor();
  const preferences = await userCenterService.getPreferences({ actor });

  return (
    <div className="bg-surface border border-border rounded-lg p-lg">
      <PreferencesForm
        initialTheme={preferences?.theme ?? null}
        initialLocale={preferences?.locale ?? null}
      />
    </div>
  );
}
