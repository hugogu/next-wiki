'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/client';
import { CopyIcon, CheckIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';

interface ApiKeyRevealProps {
  title: string;
  secret: string;
  onClose: () => void;
}

export function ApiKeyReveal({ title, secret, onClose }: ApiKeyRevealProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 30000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-md">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-lg shadow-lg">
        <h3 className="font-display text-xl font-semibold mb-md">{title}</h3>
        <p className="text-sm text-muted mb-md">{t('userCenter.apiKeys.revealWarning')}</p>
        <div className="flex items-center gap-sm mb-md">
          <code className="flex-1 break-all rounded-md bg-surface-elevated px-md py-sm text-sm font-mono">
            {secret}
          </code>
          <Button type="button" variant="ghost" onClick={handleCopy} aria-label={t('userCenter.apiKeys.copy')} title={t('userCenter.apiKeys.copy')}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span className="ml-2">{copied ? t('userCenter.apiKeys.copied') : t('userCenter.apiKeys.copy')}</span>
          </Button>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            <XIcon />
            <span className="ml-2">{t('userCenter.apiKeys.close')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
