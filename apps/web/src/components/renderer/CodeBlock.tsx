'use client';

import { useState, useCallback } from 'react';
import { CopyIcon, CheckIcon } from '@/components/icons';

export function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const wrapper =
      document.activeElement?.closest?.('[data-code-block]') ??
      document.querySelector('[data-code-block]:hover');
    const code = wrapper?.querySelector('code');
    const text = code?.textContent ?? '';
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div className="relative group" data-code-block="">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
        className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded text-muted bg-surface/80 border border-border hover:text-foreground hover:bg-surface transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
      </button>
      {children}
    </div>
  );
}
