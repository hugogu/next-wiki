'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  TranslationDocumentView,
  TranslationLanguageView,
  TranslationPromptTemplateView,
  TranslationRunView,
  TranslationStats,
  TranslationUsageRow,
} from '@next-wiki/shared';
import { SettingsTabs } from '@/components/ui/SettingsTabs';
import { useTranslation } from '@/i18n/client';
import { TranslationStatsPanel } from './TranslationStatsPanel';
import { TranslationLanguageManager } from './TranslationLanguageManager';
import { TranslationPromptManager } from './TranslationPromptManager';
import { TranslationRunCreateForm } from './TranslationRunCreateForm';
import { TranslationRunList } from './TranslationRunList';
import { TranslationDocumentList } from './TranslationDocumentList';
import { TranslationUsagePanel } from './TranslationUsagePanel';

export type TranslationTab = 'overview' | 'languages' | 'styles' | 'runs' | 'documents' | 'usage';

const TABS: TranslationTab[] = ['overview', 'languages', 'styles', 'runs', 'documents', 'usage'];

type Model = { id: string; displayName: string };

export function TranslationSettingsPanel({
  selected,
  languages,
  styles,
  models,
  runs,
  documents,
  usage,
  stats,
}: {
  selected: TranslationTab;
  languages: TranslationLanguageView[];
  styles: TranslationPromptTemplateView[];
  models: Model[];
  runs: TranslationRunView[];
  documents: TranslationDocumentView[];
  usage: TranslationUsageRow[];
  stats: TranslationStats;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const labels: Record<TranslationTab, string> = {
    overview: t('translation.admin.overview'),
    languages: t('translation.admin.languages'),
    styles: t('translation.admin.styles'),
    runs: t('translation.admin.runs'),
    documents: t('translation.admin.documents'),
    usage: t('translation.admin.usage'),
  };

  return (
    <SettingsTabs
      tabs={TABS.map((id) => ({ id, label: labels[id] }))}
      selected={selected}
      onSelect={(tab) => {
        const next = new URLSearchParams(params);
        next.set('tab', tab);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {selected === 'overview' && <TranslationStatsPanel stats={stats} />}
      {selected === 'languages' && (
        <TranslationLanguageManager languages={languages} models={models} styles={styles} />
      )}
      {selected === 'styles' && <TranslationPromptManager styles={styles} />}
      {selected === 'runs' && (
        <div className="space-y-md">
          <TranslationRunCreateForm languages={languages} models={models} styles={styles} />
          <TranslationRunList runs={runs} />
        </div>
      )}
      {selected === 'documents' && <TranslationDocumentList documents={documents} />}
      {selected === 'usage' && <TranslationUsagePanel rows={usage} />}
    </SettingsTabs>
  );
}
