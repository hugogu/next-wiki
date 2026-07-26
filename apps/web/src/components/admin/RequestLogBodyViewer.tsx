'use client';

import { useMemo, useState } from 'react';
import type { RequestLogBody } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';

function prettyBody(body: RequestLogBody): string {
  if (body.encoding !== 'utf8') return body.data;
  try {
    return JSON.stringify(JSON.parse(body.data), null, 2);
  } catch {
    return body.data;
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
        <Button variant={wrap ? 'primary' : 'secondary'} onClick={() => setWrap((value) => !value)} aria-pressed={wrap}>
          {t('admin.requestLog.wrap')}
        </Button>
        <Button variant={pretty ? 'primary' : 'secondary'} onClick={() => setPretty((value) => !value)} aria-pressed={pretty}>
          {t('admin.requestLog.pretty')}
        </Button>
      </div>
      <pre className={`max-h-96 overflow-auto rounded-md border border-border bg-surface-elevated p-md text-xs ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
        {text}
      </pre>
    </div>
  );
}
