'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/client';
import {
  ShareIcon,
  LinkIcon,
  CheckIcon,
  XBrandIcon,
  WeiboIcon,
  TelegramIcon,
  WeChatIcon,
  DiscordIcon,
  MoreHorizontalIcon,
} from '@/components/icons';

/**
 * Icon button on the page reading view that opens a small popover with the
 * public share link (/s/<id>) and a few share targets. Only rendered for
 * published pages — the share route itself refuses anything unpublished.
 */
export function ShareButton({ pageId, title }: { pageId: string; title: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Build the absolute URL from the visitor's actual origin. Computed lazily
  // once — the popover that consumes it only renders after a user click, well
  // past hydration, so there is no SSR mismatch and no need for an effect.
  const [shareUrl] = useState(() =>
    typeof window !== 'undefined' ? `${window.location.origin}/s/${pageId}` : '',
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable (insecure context); the input below still
      // lets the user select and copy manually.
    }
  };

  const nativeShare = async () => {
    if (typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title, url: shareUrl });
      setOpen(false);
    } catch {
      // User dismissed the native sheet; keep the popover open.
    }
  };

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);
  // Platforms with a web share intent open in a new tab; WeChat and Discord
  // have no such intent, so those copy the link for the user to paste.
  const linkTargets = [
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, icon: <XBrandIcon className="h-4 w-4" /> },
    { key: 'weibo', label: t('page.share.weibo'), href: `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedTitle}`, icon: <WeiboIcon className="h-4 w-4" /> },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`, icon: <TelegramIcon className="h-4 w-4" /> },
  ];
  const copyTargets = [
    { key: 'wechat', label: t('page.share.wechat'), icon: <WeChatIcon className="h-4 w-4" /> },
    { key: 'discord', label: t('page.share.discord'), icon: <DiscordIcon className="h-4 w-4" /> },
  ];

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const iconButtonClass =
    'inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted hover:text-foreground hover:bg-surface-elevated transition-colors';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('page.share.button')}
        title={t('page.share.button')}
        aria-expanded={open}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
          open ? 'bg-surface-elevated text-foreground' : 'text-muted hover:text-foreground hover:bg-surface-elevated'
        }`}
      >
        <ShareIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-surface border border-border rounded-lg shadow-lg p-md z-50 space-y-sm">
          <p className="text-sm font-medium text-foreground">{t('page.share.title')}</p>

          <div className="flex items-center gap-xs">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md border border-border bg-surface-elevated px-sm py-1 text-xs font-mono text-muted"
            />
            <button
              type="button"
              onClick={copy}
              aria-label={t('page.share.copy')}
              title={t('page.share.copy')}
              className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <LinkIcon className="h-4 w-4" />}
            </button>
          </div>
          {copied && <p className="text-xs text-success">{t('page.share.copied')}</p>}

          <div className="flex flex-wrap gap-xs pt-xs">
            {linkTargets.map((target) => (
              <a
                key={target.key}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={target.label}
                title={target.label}
                className={iconButtonClass}
              >
                {target.icon}
              </a>
            ))}
            {copyTargets.map((target) => (
              <button
                key={target.key}
                type="button"
                onClick={copy}
                aria-label={target.label}
                title={`${target.label} · ${t('page.share.copy')}`}
                className={iconButtonClass}
              >
                {target.icon}
              </button>
            ))}
            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                aria-label={t('page.share.more')}
                title={t('page.share.more')}
                className={iconButtonClass}
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
