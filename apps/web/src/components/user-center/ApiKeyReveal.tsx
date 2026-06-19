'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n/client';
import { CopyIcon, CheckIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';

interface ApiKeyRevealProps {
  title: string;
  secret: string;
  name?: string;
  created?: boolean;
  onClose: () => void;
}

export function ApiKeyReveal({ title, secret, name, created = false, onClose }: ApiKeyRevealProps) {
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
      <div className="relative w-full max-w-2xl rounded-lg border border-border bg-surface p-lg shadow-lg">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="absolute right-md top-md h-9 w-9 px-0"
          aria-label={t('userCenter.apiKeys.close')}
          title={t('userCenter.apiKeys.close')}
        >
          <XIcon className="h-4 w-4 shrink-0" />
        </Button>

        <div className="space-y-md pr-12">
          <div>
            <h3 className="font-display text-xl font-semibold">{title}</h3>
            <p className="mt-xs text-sm text-muted">
              {created ? t('userCenter.apiKeys.createdWarning') : t('userCenter.apiKeys.revealWarning')}
            </p>
          </div>

          {name ? (
            <div className="rounded-lg border border-border bg-background px-md py-sm">
              <div className="text-xs uppercase tracking-wide text-muted">{t('userCenter.apiKeys.nameLabel')}</div>
              <div className="mt-1 text-sm font-medium text-foreground">{name}</div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-surface-elevated p-md">
            <div className="mb-sm flex items-center justify-between gap-sm">
              <span className="text-xs uppercase tracking-wide text-muted">{t('userCenter.apiKeys.revealTitle')}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopy}
                className="h-9 w-9 px-0"
                aria-label={copied ? t('userCenter.apiKeys.copied') : t('userCenter.apiKeys.copy')}
                title={copied ? t('userCenter.apiKeys.copied') : t('userCenter.apiKeys.copy')}
              >
                {copied ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CopyIcon className="h-4 w-4 shrink-0" />}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <code className="block whitespace-nowrap text-sm font-mono">{secret}</code>
            </div>
          </div>

          {created ? <p className="text-xs text-muted">{t('userCenter.apiKeys.createdCopyHint')}</p> : null}
        </div>
      </div>
    </div>
  );
}
