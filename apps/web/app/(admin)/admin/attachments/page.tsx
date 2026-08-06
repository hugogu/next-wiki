import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AttachmentSettingsPanel } from '@/components/admin/attachments/AttachmentSettingsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { isStorageAdmin } from '@/server/services/storage-config';
import { getAttachmentSettings } from '@/server/services/attachment-settings';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAttachmentSettingsPage() {
  const actor = await getCurrentActor();
  if (!isStorageAdmin({ actor })) {
    notFound();
  }
  const settings = await getAttachmentSettings();
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.attachmentSettings.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.attachmentSettings.description')}</p>
        </div>
        <AttachmentSettingsPanel initial={settings} />
      </div>
    </Layout>
  );
}
