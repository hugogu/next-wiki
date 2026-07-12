'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TranslationDocumentView, TranslationFreshnessStatus } from '@next-wiki/shared';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import { TranslationVersionHistory } from './TranslationVersionHistory';

function freshnessTone(status: TranslationFreshnessStatus) {
  if (status === 'fresh') return 'success' as const;
  if (status === 'stale' || status === 'failed') return 'warning' as const;
  if (status === 'unavailable') return 'neutral' as const;
  return 'info' as const;
}

export function TranslationDocumentList({ documents }: { documents: TranslationDocumentView[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-border p-md text-sm text-muted">
        {t('translation.document.empty')}
      </p>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <DataTableRow>
          <DataTableHeader>{t('translation.document.source')}</DataTableHeader>
          <DataTableHeader>{t('translation.run.targetLocale')}</DataTableHeader>
          <DataTableHeader>{t('translation.document.freshness')}</DataTableHeader>
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
              <DataTableCell className="font-mono uppercase">{doc.targetLocale}</DataTableCell>
              <DataTableCell>
                <StatusBadge tone={freshnessTone(doc.freshness)}>
                  {t(`translation.freshness.${doc.freshness}`)}
                </StatusBadge>
              </DataTableCell>
              <DataTableCell>
                <div className="flex gap-xs">
                  <Link
                    className="text-sm text-primary hover:underline"
                    href={doc.translationUrl}
                    target="_blank"
                  >
                    {t('translation.document.open')}
                  </Link>
                  <Button
                   
                    variant="ghost"
                    onClick={() =>
                      setExpanded((cur) => (cur === doc.translationPageId ? null : doc.translationPageId))
                    }
                  >
                    {t('translation.run.detail.history')}
                  </Button>
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
  );
}
