import type { Metadata } from 'next';
import { getLocale, getDictionary } from '@/i18n/server';
import { PasswordChangeForm } from '@/components/user-center/PasswordChangeForm';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.password.metadataTitle') };
}

export default function PasswordPage() {
  return (
    <section className="max-w-2xl bg-surface border border-border rounded-lg p-lg">
      <PasswordChangeForm />
    </section>
  );
}
