'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TranslationDocumentView } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { HistoryIcon, LanguagesIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import { TranslatePageDialog } from '@/components/pages/TranslatePageDialog';
import { TranslationVersionHistory } from './TranslationVersionHistory';

export function TranslationDocumentList({ documents }: { documents: TranslationDocumentView[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retranslating, setRetranslating] = useState<TranslationDocumentView | null>(null);

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-border p-md text-sm text-muted">
        {t('translation.document.empty')}
      </p>
    );
  }

  return (
    <>
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableHeader>{t('translation.document.source')}</DataTableHeader>
            <DataTableHeader>{t('translation.run.targetLocale')}</DataTableHeader>
            <DataTableHeader>{t('translation.document.translatedAt')}</DataTableHeader>
            <DataTableHeader>{t('admin.transfers.table.actions')}</DataTableHeader>
          </DataTableRow>
        </DataTableHead>
        <DataTableBody>
          {documents.map((doc) => (
            <>
              <DataTableRow key={doc.translationPageId}>
                <DataTableCell>
                  <Link className="text-primary hover:underline" href={doc.sourceUrl}>
                    {doc.sourcePath}
                  </Link>
                </DataTableCell>
                <DataTableCell>
                  <Link
                    className="font-mono uppercase text-primary hover:underline"
                    href={doc.translationUrl}
                    target="_blank"
                  >
                    {doc.targetLocale}
                  </Link>
                </DataTableCell>
                <DataTableCell className="text-muted">
                  {new Date(doc.updatedAt).toLocaleString()}
                </DataTableCell>
                <DataTableCell>
                  <div className="flex items-center gap-xs">
                    <Tooltip label={t('translation.document.retranslate')}>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('translation.document.retranslate')}
                        onClick={() => setRetranslating(doc)}
                      >
                        <LanguagesIcon className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip label={t('translation.run.detail.history')}>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('translation.run.detail.history')}
                        onClick={() =>
                          setExpanded((cur) => (cur === doc.translationPageId ? null : doc.translationPageId))
                        }
                      >
                        <HistoryIcon className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </DataTableCell>
              </DataTableRow>
              {expanded === doc.translationPageId && (
                <DataTableRow key={`${doc.translationPageId}-history`}>
                  <DataTableCell colSpan={4}>
                    <TranslationVersionHistory translationPageId={doc.translationPageId} />
                  </DataTableCell>
                </DataTableRow>
              )}
            </>
          ))}
        </DataTableBody>
      </DataTable>
      {retranslating && (
        <TranslatePageDialog
          pageId={retranslating.sourcePageId}
          initialTargetLocale={retranslating.targetLocale}
          onClose={() => setRetranslating(null)}
        />
      )}
    </>
  );
}
