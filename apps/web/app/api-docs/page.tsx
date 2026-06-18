import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { Layout } from '@/components/ui/Layout';
import { getLocale, getDictionary } from '@/i18n/server';

const ApiDocsViewer = nextDynamic(
  () => import('@/components/api-docs/ApiDocsViewer').then((mod) => mod.ApiDocsViewer),
  { ssr: false },
);

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('apiDocs.metadataTitle') };
}

export default function ApiDocsPage() {
  return (
    <Layout>
      <div className="api-docs-container h-[calc(100vh-4rem)]">
        <ApiDocsViewer />
      </div>
    </Layout>
  );
}
