import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function Forbidden() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout>
      <div className="text-center px-lg py-xl">
        <h1 className="font-display text-5xl font-semibold mb-sm">{t('errors.forbidden.code')}</h1>
        <p className="text-muted mb-md">{t('errors.forbidden.message')}</p>
        <Link href="/" className="text-primary hover:underline">
          {t('errors.forbidden.backHome')}
        </Link>
      </div>
    </Layout>
  );
}
