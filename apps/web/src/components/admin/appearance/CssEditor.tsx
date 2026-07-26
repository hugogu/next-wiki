'use client';

import { CodeEditor } from '@/components/ui/CodeEditor';

/**
 * CSS editor for the system-theme manager.
 *
 * A thin binding over the shared `ui/CodeEditor` primitive. The CodeMirror
 * setup lives there so the skill file editor is not a third bespoke mount
 * (constitution P6, and the "per-page bespoke styling" anti-pattern).
 */
export function CssEditor({
  value,
  onChange,
  readOnly = false,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      language="css"
      readOnly={readOnly}
      ariaLabel={ariaLabel}
    />
  );
}
