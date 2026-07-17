import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { FirstRunOnboarding } from '@/components/setup/FirstRunOnboarding';
import * as setupService from '@/server/services/setup';
import { reconcileSetupAi } from '@/server/services/setup-ai';
import { getCurrentActor } from '@/server/services/auth';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('setup.metadataTitle') };
}

export default async function SetupPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const actor = await getCurrentActor();
  // Advance any in-flight AI bootstrap so a refresh resumes at the right step.
  await reconcileSetupAi(actor).catch(() => undefined);
  const state = await setupService.getSetupState(actor);

  // Closed setup (complete, or an Admin predating onboarding) hands off to
  // normal routes; once an Admin exists, every post-account step requires the
  // signed-in Admin — anonymous visitors never see the account form again.
  if (state.currentStep === 'closed') {
    redirect('/');
  }
  const adminExists = !(await setupService.isSetupNeeded());
  if (adminExists && (actor.kind !== 'user' || actor.role !== 'admin')) {
    redirect('/');
  }

  return (
    <Layout skipPasswordGate>
      <div className="max-w-md mx-auto px-lg py-xl">
        <h1 className="font-display text-2xl font-semibold mb-md">{t('setup.heading')}</h1>
        <p className="text-muted mb-md text-sm">{t('setup.description')}</p>
        <FirstRunOnboarding initialState={state} />
      </div>
    </Layout>
  );
}
