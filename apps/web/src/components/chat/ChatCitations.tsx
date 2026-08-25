'use client';

import { useState } from 'react';
import type { AiCitation } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { getCitationHref } from '@/lib/path';

export function ChatCitations({ citations, actionId }: { citations?: AiCitation[]; actionId?: string }) {
  const { t } = useTranslation();
  const [preserved, setPreserved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const preserve = async (citation: Extract<AiCitation, { kind: 'web' }>) => {
    if (!actionId || saving) return;
    setSaving(citation.sourceId);
    const response = await fetch(`/api/ai/web-research/sources/${encodeURIComponent(citation.sourceId)}/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId }),
    });
    if (response.ok) {
      const result = await response.json() as { rawPath: string };
      setPreserved((value) => ({ ...value, [citation.sourceId]: `/raw/${result.rawPath}` }));
    }
    setSaving(null);
  };
  if (!citations?.length) return null;
  return (
    <ul className="mt-sm space-y-xs border-t border-border pt-sm text-xs">
      {citations.map((citation) => (
        <li key={citation.kind === 'web' ? citation.sourceId : `${citation.pageId}:${citation.revisionId}`}>
          <div className="flex items-center gap-sm">
            <a
              className="text-primary hover:underline"
              href={getCitationHref(citation)}
              {...(citation.kind === 'web' ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {citation.kind === 'web' ? `${t('ai.chat.citations.external')}: ` : ''}{citation.title}
            </a>
            {citation.kind === 'web' && actionId && (
              preserved[citation.sourceId]
                ? <a className="text-primary hover:underline" href={preserved[citation.sourceId]}>{t('ai.chat.citations.preserved')}</a>
                : <button type="button" className="text-primary hover:underline" disabled={saving === citation.sourceId} onClick={() => { void preserve(citation); }}>{saving === citation.sourceId ? t('ai.chat.citations.preserving') : t('ai.chat.citations.preserve')}</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
