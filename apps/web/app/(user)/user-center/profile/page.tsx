import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getCurrentActor } from '@/server/services/auth';
import { getLocale, getDictionary } from '@/i18n/server';
import { ProfileForm } from '@/components/user-center/ProfileForm';
import * as userCenterService from '@/server/services/user-center';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.profile.metadataTitle') };
}

export default async function ProfilePage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    notFound();
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, actor.userId),
    columns: { id: true, email: true, displayName: true },
  });

  if (!user) {
    notFound();
  }

  const preferences = await userCenterService.getPreferences({ actor });

  return (
    <section className="bg-surface border border-border rounded-lg p-lg">
      <ProfileForm
        initialEmail={user.email}
        initialDisplayName={user.displayName ?? ''}
        initialTheme={preferences?.theme ?? null}
        initialLocale={preferences?.locale ?? null}
      />
    </section>
  );
}
