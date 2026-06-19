'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PageContext } from './types';
import type { Actor } from '@/server/permissions';
import { useEditor } from '@/components/editor/EditorContext';
import { UserDropdown } from './UserDropdown';
import { useTranslation } from '@/i18n/client';
import {
  MenuIcon,
  PlusIcon,
  EditIcon,
  HistoryIcon,
  PublishIcon,
  EyeIcon,
  SettingsIcon,
  ShieldIcon,
  SaveIcon,
  XIcon,
  CodeIcon,
} from '@/components/icons';
import { apiPost } from '@/lib/api/client';
import { getPageHref, getEditHref, getHistoryHref } from '@/lib/path';

function IconButton({
  href,
  onClick,
  label,
  children,
  active = false,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const baseClass =
    'inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed';
  const stateClass = active
    ? 'bg-primary text-primary-text'
    : 'text-muted hover:text-foreground hover:bg-surface-elevated';

  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={`${baseClass} ${stateClass}`}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${baseClass} ${stateClass}`}
    >
      {children}
    </button>
  );
}

function EditorHeaderActions({ editor }: { editor: NonNullable<ReturnType<typeof useEditor> > }) {
  const { t } = useTranslation();
  return (
    <>
      <IconButton onClick={editor.save} label={t('editor.header.save')} disabled={editor.isSaving}>
        <SaveIcon />
      </IconButton>
      <IconButton onClick={editor.close} label={t('editor.header.close')}>
        <XIcon />
      </IconButton>
      <IconButton
        onClick={editor.toggleProperties}
        label={t('editor.header.properties')}
        active={editor.propertiesOpen}
      >
        <SettingsIcon />
      </IconButton>
    </>
  );
}

export function Header({
  user,
  pageContext,
  onMenuClick,
}: {
  user: Actor;
  pageContext?: PageContext;
  onMenuClick: () => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const [publishing, setPublishing] = useState(false);
  const isSignedIn = user.kind === 'user';
  const role = isSignedIn ? user.role : null;

  const handlePublish = async () => {
    if (!pageContext || !pageContext.canPublish || pageContext.status === 'published') return;
    setPublishing(true);
    try {
      await apiPost<{ path: string; version: number }, { versionId: string }>('/api/revisions/publish', {
        path: pageContext.path,
        version: pageContext.version,
      });
      window.location.href = getPageHref(pageContext.path);
    } catch {
      setPublishing(false);
    }
  };

  const pathname = usePathname();
  const isOnUserCenter = pathname.startsWith('/user-center');
  const isOnAdmin = pathname.startsWith('/admin');
  const title = editor
    ? editor.title.trim() || editor.defaultTitle
    : isOnUserCenter
      ? t('userCenter.title')
      : isOnAdmin
        ? t('admin.title')
        : pageContext?.title ?? null;

  return (
    <header className="h-header shrink-0 bg-surface border-b border-border flex items-center justify-between px-md lg:px-lg relative">
      <div className="flex items-center gap-md">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          aria-label={t('layout.header.openNav')}
        >
          <MenuIcon />
        </button>
        <Link href="/" className="font-display text-xl font-semibold text-foreground tracking-tight">
          {t('common.brand')}
        </Link>
      </div>

      {title && (
        <div
          data-testid="page-title"
          className="absolute left-1/2 -translate-x-1/2 max-w-[45%] truncate font-display text-base font-medium text-foreground"
        >
          {title}
        </div>
      )}

      <div className="flex items-center gap-sm">
        {editor ? (
          <EditorHeaderActions editor={editor} />
        ) : (
          <>
            <div className="flex items-center gap-sm pr-sm border-r border-border">
              {pageContext && pageContext.canEdit && (
                <IconButton href={getEditHref(pageContext.path)} label={t('page.header.edit')}>
                  <EditIcon />
                </IconButton>
              )}

              {pageContext && isSignedIn && (
                <IconButton href={getHistoryHref(pageContext.path)} label={t('page.header.history')}>
                  <HistoryIcon />
                </IconButton>
              )}

              {pageContext && pageContext.canPublish && pageContext.status === 'draft' && (
                <IconButton
                  onClick={handlePublish}
                  label={publishing ? t('page.header.publishing') : t('page.header.publish')}
                >
                  <PublishIcon />
                </IconButton>
              )}

              {pageContext && (
                <IconButton href={getPageHref(pageContext.path)} label={t('page.header.view')} active>
                  <EyeIcon />
                </IconButton>
              )}
              {isSignedIn && (role === 'editor' || role === 'admin') && (
                <IconButton href="/new" label={t('page.header.newPage')}>
                  <PlusIcon />
                </IconButton>
              )}
            </div>

            <div className="flex items-center gap-sm">
        <IconButton href="/api-docs" label={t('layout.header.apiDocs')}>
          <CodeIcon />
        </IconButton>
              {role === 'admin' && (
                <IconButton href="/admin/users" label={t('page.header.admin')}>
                  <ShieldIcon />
                </IconButton>
              )}
            </div>
          </>
        )}

        <UserDropdown user={user} />
      </div>
    </header>
  );
}
