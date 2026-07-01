import type { Metadata } from 'next';
import { ApiDocsViewer } from '@/components/api-docs/ApiDocsViewer';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('apiDocs.metadataTitle') };
}

export default function ApiDocsPage() {
  return (
    <div className="api-docs-container">
      <ApiDocsViewer />
    </div>
  );
}
