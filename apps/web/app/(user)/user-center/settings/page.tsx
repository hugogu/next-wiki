import { redirect } from 'next/navigation';
import { getLocale, getDictionary } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { getMyEntitlements } from '@/server/services/ai-entitlements';
import { WebResearchSettingsForm } from '@/components/user-center/WebResearchSettingsForm';

export const dynamic = 'force-dynamic';

export default async function UserSettingsPage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') redirect('/auth/login');

  const [preferences, entitlements] = await Promise.all([
    userCenterService.getPreferences({ actor }),
    getMyEntitlements({ actor }),
  ]);
  const locale = await getLocale(preferences?.locale);
  const t = getDictionary(locale);
  const initial = preferences ?? { theme: null, locale: null, webResearchPreference: false };

  return (
    <div className="space-y-md">
      <div>
        <h1 className="font-display text-xl font-semibold">{t('userCenter.webResearch.pageTitle')}</h1>
        <p className="mt-xs text-sm text-muted">{t('userCenter.webResearch.pageDescription')}</p>
      </div>
      <WebResearchSettingsForm
        initial={initial}
        entitled={entitlements.webResearchEnabled}
        available={entitlements.webResearchAvailable}
      />
    </div>
  );
}
