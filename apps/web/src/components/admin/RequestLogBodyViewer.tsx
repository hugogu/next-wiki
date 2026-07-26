'use client';

import { useMemo, useState } from 'react';
import type { RequestLogBody } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { CodeIcon, WrapTextIcon } from '@/components/icons';

function prettyXml(source: string): string {
  const lines = source.replace(/>\s*</g, '><').replace(/(>)(<)/g, '$1\n$2').split('\n');
  let depth = 0;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^<\//.test(trimmed)) depth = Math.max(0, depth - 1);
    const result = `${'  '.repeat(depth)}${trimmed}`;
    if (/^<(?![?!/])[^>]*[^/]>$/.test(trimmed) && !/<\/[^>]+>$/.test(trimmed)) depth += 1;
    return result;
  }).join('\n');
}

function prettyBody(body: RequestLogBody): string {
  if (body.encoding !== 'utf8') return body.data;
  try {
    // JSON.stringify normally re-escapes newlines inside string values. Keep
    // those as real lines in this diagnostic viewer for readable prompts.
    return JSON.stringify(JSON.parse(body.data), null, 2).replace(/\\n/g, '\n');
  } catch {
    const text = body.data.replace(/\\n/g, '\n');
    return /^\s*</.test(text) || /xml/i.test(body.contentType ?? '') ? prettyXml(text) : text;
  }
}

/** Local-only presentation controls for sensitive request/response body text. */
export function RequestLogBodyViewer({ body }: { body: RequestLogBody }) {
  const { t } = useTranslation();
  const [wrap, setWrap] = useState(true);
  const [pretty, setPretty] = useState(false);
  const text = useMemo(() => (pretty ? prettyBody(body) : body.data), [body, pretty]);

  return (
    <div className="space-y-xs">
      <div className="flex flex-wrap gap-xs">
        <Button size="icon" variant={wrap ? 'primary' : 'secondary'} onClick={() => setWrap((value) => !value)} aria-pressed={wrap} aria-label={t('admin.requestLog.wrap')} title={t('admin.requestLog.wrap')}>
          <WrapTextIcon className="h-4 w-4" />
        </Button>
        <Button size="icon" variant={pretty ? 'primary' : 'secondary'} onClick={() => setPretty((value) => !value)} aria-pressed={pretty} aria-label={t('admin.requestLog.pretty')} title={t('admin.requestLog.pretty')}>
          <CodeIcon className="h-4 w-4" />
        </Button>
      </div>
      <pre className={`max-h-96 overflow-auto rounded-md border border-border bg-surface-elevated p-md text-xs ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
        {text}
      </pre>
    </div>
  );
}
