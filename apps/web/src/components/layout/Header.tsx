'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PageContext } from './types';
import type { Actor } from '@/server/permissions';
import { useEditor } from '@/components/editor/EditorContext';
import { useTranslation } from '@/i18n/client';
import {
  MenuIcon,
  PlusIcon,
  EditIcon,
  HistoryIcon,
  PublishIcon,
  EyeIcon,
  SettingsIcon,
  SaveIcon,
  XIcon,
  ChevronLeftIcon,
} from '@/components/icons';
import { apiPost } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { getPageHref, getEditHref, getHistoryHref, getPublicApiPagePublicationUrl } from '@/lib/path';
import { HeaderHybridSearch } from '@/components/search/HeaderHybridSearch';

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
  siteName,
}: {
  user: Actor;
  pageContext?: PageContext;
  onMenuClick: () => void;
  siteName: string;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { goBack } = useHistory();
  const [publishing, setPublishing] = useState(false);
  const isSignedIn = user.kind === 'user';
  const role = isSignedIn ? user.role : null;

  const handlePublish = async () => {
    if (!pageContext || !pageContext.pageId || !pageContext.canPublish || pageContext.status === 'published') return;
    setPublishing(true);
    try {
      await apiPost<Record<string, never>, unknown>(getPublicApiPagePublicationUrl(pageContext.pageId, pageContext.version), {});
      window.location.href = getPageHref(pageContext.path);
    } catch {
      setPublishing(false);
    }
  };

  const pathname = usePathname();
  const isOnUserCenter = pathname.startsWith('/user-center');
  const isOnAdmin = pathname.startsWith('/admin');
  const routeTitle =
    pathname === '/user-center/profile'
      ? t('userCenter.nav.profile')
      : pathname === '/user-center/password'
        ? t('userCenter.nav.password')
        : pathname === '/user-center/api-keys'
          ? t('userCenter.nav.apiKeys')
          : pathname === '/user-center/audit'
            ? t('userCenter.nav.audit')
            : pathname === '/admin/users'
              ? t('admin.nav.users')
            : pathname === '/admin/pages'
              ? t('admin.nav.pages')
            : pathname === '/admin/tags'
              ? t('admin.nav.tags')
              : pathname === '/admin/search'
                ? t('admin.nav.search')
              : pathname.startsWith('/admin/ai')
                ? t('admin.nav.ai')
              : pathname === '/admin/api-audit'
                ? t('admin.nav.apiAudit')
                : null;
  const title = editor
    ? editor.title.trim() || editor.defaultTitle
    : routeTitle ?? pageContext?.title ?? (isOnUserCenter ? t('userCenter.title') : isOnAdmin ? t('admin.title') : null);

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
          {siteName}
        </Link>
      </div>

      {!editor && <HeaderHybridSearch />}
      {editor && title && (
        <div
          data-testid="page-title"
          className="absolute left-1/2 -translate-x-1/2 max-w-[45%] truncate font-display text-lg font-semibold text-foreground sm:text-xl"
        >
          {title}
        </div>
      )}

      <div className="flex items-center gap-sm">
        {editor ? (
          <EditorHeaderActions editor={editor} />
        ) : (
          <>
            <div className="flex items-center gap-sm">
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
              {(isOnUserCenter || isOnAdmin) ? (
                <IconButton onClick={() => goBack('/')} label={t('common.actions.back')}>
                  <ChevronLeftIcon />
                </IconButton>
              ) : isSignedIn && (role === 'editor' || role === 'admin') && (
                <IconButton href="/new" label={t('page.header.newPage')}>
                  <PlusIcon />
                </IconButton>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
