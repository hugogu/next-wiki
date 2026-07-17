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
  LanguagesIcon,
  TrashIcon,
} from '@/components/icons';
import { TranslatePageDialog } from '@/components/pages/TranslatePageDialog';
import { apiPost } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import { getPageHref, getEditHref, getHistoryHref, getTranslatedPageHref, getPublicApiPagePublicationUrl } from '@/lib/path';
import { translationLanguageName } from '@next-wiki/shared';
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

function LanguageLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-sm px-sm py-xs text-sm transition-colors hover:bg-surface-elevated ${
        active ? 'font-medium text-primary' : 'text-foreground'
      }`}
    >
      {label}
    </Link>
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
      {editor.canDelete && (
        <IconButton onClick={editor.requestDelete} label={t('editor.header.delete')}>
          <TrashIcon />
        </IconButton>
      )}
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
  const [translateOpen, setTranslateOpen] = useState(false);
  const isSignedIn = user.kind === 'user';
  const role = isSignedIn ? user.role : null;
  // Translating a page targets the original source, so only offer it on the
  // original (not a translated view) and only to admins (manage_translations).
  const canTranslate =
    role === 'admin' && Boolean(pageContext?.pageId) && !pageContext?.currentLocale;

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
                ? t('admin.nav.providers')
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

              {canTranslate && (
                <IconButton onClick={() => setTranslateOpen(true)} label={t('page.header.translate')}>
                  <LanguagesIcon />
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

              {pageContext && pageContext.sourcePath && (pageContext.translationLocales?.length ?? 0) > 0 ? (
                <div className="group relative">
                  <IconButton href={getPageHref(pageContext.path)} label={t('page.header.view')} active>
                    <EyeIcon />
                  </IconButton>
                  <div className="invisible absolute right-0 top-full z-30 mt-xs min-w-[10rem] rounded-md border border-border bg-surface p-xs opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <p className="px-sm py-xs text-xs font-medium text-muted">{t('page.header.otherLanguages')}</p>
                    <LanguageLink
                      href={getPageHref(pageContext.sourcePath)}
                      label={t('page.header.original')}
                      active={!pageContext.currentLocale}
                    />
                    {pageContext.translationLocales!.map((locale) => (
                      <LanguageLink
                        key={locale}
                        href={getTranslatedPageHref(locale, pageContext.sourcePath!)}
                        label={translationLanguageName(locale)}
                        active={pageContext.currentLocale === locale}
                      />
                    ))}
                  </div>
                </div>
              ) : pageContext ? (
                <IconButton href={getPageHref(pageContext.path)} label={t('page.header.view')} active>
                  <EyeIcon />
                </IconButton>
              ) : null}
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
      {translateOpen && pageContext?.pageId && (
        <TranslatePageDialog pageId={pageContext.pageId} onClose={() => setTranslateOpen(false)} />
      )}
    </header>
  );
}
