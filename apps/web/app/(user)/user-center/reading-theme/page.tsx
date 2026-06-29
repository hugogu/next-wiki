import { redirect } from 'next/navigation';
import { ReadingThemeForm } from '@/components/user-center/ReadingThemeForm';
import { PREVIEW_SAMPLE_MARKDOWN } from '@/components/appearance/preview-sample';
import { getCurrentActor } from '@/server/services/auth';
import { getUserAppearance } from '@/server/services/user-appearance';
import { renderMarkdown } from '@/server/pipeline';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function ReadingThemePage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') redirect('/auth/login');

  const initial = await getUserAppearance({ actor });
  const { html: sampleHtml } = renderMarkdown(PREVIEW_SAMPLE_MARKDOWN);
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="space-y-md">
      <div>
        <h1 className="font-display text-xl font-semibold">{t('userCenter.readingTheme.title')}</h1>
        <p className="mt-xs text-sm text-muted">{t('userCenter.readingTheme.description')}</p>
      </div>
      <ReadingThemeForm initial={initial} sampleHtml={sampleHtml} />
    </div>
  );
}
