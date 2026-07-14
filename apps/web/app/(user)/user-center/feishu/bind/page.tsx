import type { Metadata } from 'next';
import { getLocale, getDictionary } from '@/i18n/server';
import { FeishuBindConfirm } from '@/components/user-center/FeishuBindConfirm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.feishu.metadataTitle') };
}

export default async function FeishuBindPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="max-w-2xl bg-surface border border-border rounded-lg p-lg">
      <FeishuBindConfirm token={token ?? null} />
    </section>
  );
}
