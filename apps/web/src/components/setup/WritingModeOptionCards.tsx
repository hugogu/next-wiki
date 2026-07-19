'use client';

import type { ReactNode } from 'react';
import type { WritingMode } from '@next-wiki/shared';
import { LayersIcon, PenSparkIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

type ModeOption = {
  id: WritingMode;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  featureKeys: readonly TranslationKey[];
  icon: ReactNode;
};

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: 'copilot',
    titleKey: 'setup.writingMode.copilot.title',
    descriptionKey: 'setup.writingMode.copilot.description',
    featureKeys: [
      'setup.writingMode.copilot.features.feature1',
      'setup.writingMode.copilot.features.feature2',
      'setup.writingMode.copilot.features.feature3',
    ] as const,
    icon: <PenSparkIcon className="h-6 w-6" aria-hidden="true" />,
  },
  {
    id: 'llm-wiki',
    titleKey: 'setup.writingMode.llmWiki.title',
    descriptionKey: 'setup.writingMode.llmWiki.description',
    featureKeys: [
      'setup.writingMode.llmWiki.features.feature1',
      'setup.writingMode.llmWiki.features.feature2',
      'setup.writingMode.llmWiki.features.feature3',
    ] as const,
    icon: <LayersIcon className="h-6 w-6" aria-hidden="true" />,
  },
];

export type WritingModeOptionCardsProps = {
  /** Highlights the card matching this mode as the active selection. */
  selectedMode: WritingMode;
  /** When provided, cards become clickable. Omit for read-only display. */
  onSelect?: (mode: WritingMode) => void;
  /** Shown on the copilot card (typically only used during first-run setup). */
  showRecommendedBadge?: boolean;
  /** Optional label override for the highlight badge (default: "Current"). */
  selectedBadgeKey?: TranslationKey;
};

export function WritingModeOptionCards({
  selectedMode,
  onSelect,
  showRecommendedBadge = false,
  selectedBadgeKey,
}: WritingModeOptionCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-md md:grid-cols-2" role={onSelect ? 'radiogroup' : undefined}>
      {MODE_OPTIONS.map((option) => {
        const selected = option.id === selectedMode;
        const interactive = typeof onSelect === 'function';
        return (
          <button
            key={option.id}
            type="button"
            role={interactive ? 'radio' : undefined}
            aria-checked={interactive ? selected : undefined}
            aria-pressed={!interactive ? selected : undefined}
            disabled={!interactive}
            onClick={interactive ? () => onSelect(option.id) : undefined}
            className={
              selected
                ? 'flex h-full flex-col items-start gap-md rounded-lg border-2 border-primary bg-primary/10 p-lg text-left transition-colors'
                : 'flex h-full flex-col items-start gap-md rounded-lg border border-border bg-background p-lg text-left transition-colors hover:border-border-strong hover:bg-surface disabled:cursor-default disabled:hover:border-border disabled:hover:bg-background'
            }
          >
            <div className="flex w-full items-start justify-between gap-sm">
              <span
                className={
                  selected
                    ? 'flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-text'
                    : 'flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-foreground'
                }
              >
                {option.icon}
              </span>
              {showRecommendedBadge && selected && option.id === 'copilot' && (
                <span className="rounded bg-primary px-sm py-xs text-xs font-medium text-primary-text">
                  {t('setup.writingMode.recommended')}
                </span>
              )}
              {!showRecommendedBadge && selected && selectedBadgeKey && (
                <span className="rounded bg-primary px-sm py-xs text-xs font-medium text-primary-text">
                  {t(selectedBadgeKey)}
                </span>
              )}
            </div>
            <div className="space-y-xs">
              <span className="block text-lg font-semibold">{t(option.titleKey)}</span>
              <p className="text-sm text-muted">{t(option.descriptionKey)}</p>
            </div>
            <ul className="mt-auto w-full space-y-xs border-t border-border/60 pt-md text-sm">
              {option.featureKeys.map((key) => (
                <li key={key} className="flex items-start gap-xs">
                  <span
                    aria-hidden="true"
                    className={
                      selected
                        ? 'mt-xs h-1.5 w-1.5 shrink-0 rounded-full bg-primary'
                        : 'mt-xs h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong'
                    }
                  />
                  <span className="flex-1">{t(key)}</span>
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

export { MODE_OPTIONS };
