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
  SettingsIcon,
  SaveIcon,
  XIcon,
  ChevronLeftIcon,
  LanguagesIcon,
  TrashIcon,
  MoreHorizontalIcon,
  RefreshIcon,
} from '@/components/icons';
import { TranslatePageDialog } from '@/components/pages/TranslatePageDialog';
import { PagePropertiesDialog } from '@/components/pages/PagePropertiesDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiPost, apiDelete, type ApiError } from '@/lib/api/client';
import { useHistory } from '@/lib/history';
import {
  getConfiguredSpaceHref,
  getPageHref,
  getSpaceHistoryHref,
  getPublicApiPageUrl,
  getPublicApiPagePublicationUrl,
  getSpaceEditHref,
  getSpaceHref,
  getSpaceNewHref,
  getPublicApiPageRenderingUrl,
  getTranslatedPageHref,
} from '@/lib/path';
import { translationLanguageName } from '@next-wiki/shared';
import { HeaderHybridSearch } from '@/components/search/HeaderHybridSearch';

function IconButton({
  href,
  onClick,
  label,
  children,
  active = false,
  highlight = false,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
  highlight?: boolean;
  disabled?: boolean;
}) {
  const baseClass =
    'inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed';
  const stateClass = active
    ? 'bg-primary text-primary-text'
    : highlight
      ? 'text-primary hover:bg-surface-elevated'
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

/**
 * Hover/focus-triggered dropdown consolidating the reader-page page actions
 * (edit, history, re-render, settings, delete) and — when translations exist —
 * the language switcher. Renders nothing when there are no qualifying actions.
 */
function MoreActionsMenu({
  pageContext,
  showDelete,
  onOpenSettings,
  onRequestDelete,
  onRequestRerender,
  onTranslate,
}: {
  pageContext: NonNullable<PageContext>;
  showDelete: boolean;
  onOpenSettings: () => void;
  onRequestDelete: () => void;
  onRequestRerender: () => void;
  onTranslate?: () => void;
}) {
  const { t } = useTranslation();

  const editHref = getSpaceEditHref(pageContext.space ?? 'wiki', pageContext.path);
  const historyHref = getSpaceHistoryHref(pageContext.space ?? 'wiki', pageContext.path);
  const hasLanguages = pageContext.sourcePath ? (pageContext.translationLocales?.length ?? 0) > 0 : false;

  // The static reader document carries no page-level canDelete; the menu only
  // offers destructive/configurable actions when the viewer is signed in.
  const showSettings = pageContext.canEdit && pageContext.space !== 'raw';
  const showEdit = pageContext.canEdit;
  const showHistory = pageContext.space !== 'raw';
  // Rendered HTML is stored at write time, so a page keeps whatever the render
  // pipeline produced back then. This is how an editor picks up a renderer fix
  // without inventing a content change to trigger a save.
  const showRerender = pageContext.canEdit && Boolean(pageContext.pageId);

  if (!showEdit && !showHistory && !showSettings && !showRerender && !showDelete && !hasLanguages && !onTranslate) return null;

  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={t('page.header.actions')}
        title={t('page.header.actions')}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <MoreHorizontalIcon />
      </button>
      {/* The outer padding preserves the visual gap without creating a gap in
          the hover target, so the menu stays open while the pointer moves down. */}
      <div className="invisible absolute right-0 top-full z-30 min-w-[12rem] pt-xs pointer-events-none opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        <div className="rounded-md border border-border bg-surface p-xs shadow-lg">
          {showEdit && (
            <Link href={editHref} className="flex items-center gap-sm rounded-md px-md py-sm text-sm text-foreground transition-colors hover:bg-surface-elevated">
              <EditIcon />
              <span>{t('page.header.edit')}</span>
            </Link>
          )}
          {showHistory && (
            <Link href={historyHref} className="flex items-center gap-sm rounded-md px-md py-sm text-sm text-foreground transition-colors hover:bg-surface-elevated">
              <HistoryIcon />
              <span>{t('page.header.history')}</span>
            </Link>
          )}
          {onTranslate && (
            <button type="button" onClick={onTranslate} className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left text-sm text-foreground transition-colors hover:bg-surface-elevated">
              <LanguagesIcon />
              <span>{t('page.header.translate')}</span>
            </button>
          )}
          {showSettings && (
            <button type="button" onClick={onOpenSettings} className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left text-sm text-foreground transition-colors hover:bg-surface-elevated">
              <SettingsIcon />
              <span>{t('page.header.settings')}</span>
            </button>
          )}
          {showRerender && (
            <button type="button" onClick={onRequestRerender} className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left text-sm text-foreground transition-colors hover:bg-surface-elevated">
              <RefreshIcon />
              <span>{t('page.header.rerender')}</span>
            </button>
          )}
          {showDelete && (
            <button type="button" onClick={onRequestDelete} className="flex w-full items-center gap-sm rounded-md px-md py-sm text-left text-sm text-danger transition-colors hover:bg-surface-elevated">
              <TrashIcon />
              <span>{t('editor.header.delete')}</span>
            </button>
          )}
          {hasLanguages && (
            <>
              <div className="my-xs border-t border-border" />
              <p className="px-md py-xs text-xs font-medium text-muted">{t('page.header.otherLanguages')}</p>
              <LanguageLink href={pageContext.routePrefix ? getConfiguredSpaceHref(pageContext.routePrefix, pageContext.sourcePath!) : getPageHref(pageContext.sourcePath!)} label={t('page.header.original')} active={!pageContext.currentLocale} />
              {pageContext.translationLocales!.map((locale) => (
                <LanguageLink
                  key={locale}
                  href={pageContext.routePrefix ? getConfiguredSpaceHref(pageContext.routePrefix, pageContext.sourcePath!, locale) : getTranslatedPageHref(locale, pageContext.sourcePath!)}
                  label={translationLanguageName(locale)}
                  active={pageContext.currentLocale === locale}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditorHeaderActions({ editor }: { editor: NonNullable<ReturnType<typeof useEditor> > }) {
  const { t } = useTranslation();
  return (
    <>
      <IconButton
        onClick={editor.save}
        label={t('editor.header.save')}
        disabled={editor.isSaving || !editor.hasChanges}
        highlight={editor.hasChanges && !editor.isSaving}
      >
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rerenderOpen, setRerenderOpen] = useState(false);
  const [rerenderError, setRerenderError] = useState<string | null>(null);
  const [isRerendering, setIsRerendering] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isSignedIn = user.kind === 'user';
  const role = isSignedIn ? user.role : null;
  // Translating a page targets the original source, so only offer it on the
  // original (not a translated view) and only to admins (manage_translations).
  const canTranslate =
    role === 'admin' && (!pageContext?.space || pageContext.space === 'wiki') && Boolean(pageContext?.pageId) && !pageContext?.currentLocale;

  const handlePublish = async () => {
    if (!pageContext || !pageContext.pageId || !pageContext.canPublish || pageContext.status === 'published') return;
    setPublishing(true);
    try {
      await apiPost<Record<string, never>, unknown>(getPublicApiPagePublicationUrl(pageContext.pageId, pageContext.version), {});
      // 035: navigate to the reader address (slug), not the tree path.
      const readerPath = pageContext.sourcePath ?? pageContext.path;
      window.location.href = pageContext.routePrefix ? getConfiguredSpaceHref(pageContext.routePrefix, readerPath) : getSpaceHref(pageContext.space ?? 'wiki', readerPath);
    } catch {
      setPublishing(false);
    }
  };

  // Delete is offered to signed-in editors/admins. The static reader document
  // cannot know page-level canDelete, so visibility is role-based and the
  // DELETE endpoint enforces true authorization (author/admin) server-side.
  const canDeletePage = isSignedIn && (role === 'editor' || role === 'admin');

  const requestDelete = () => {
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!pageContext?.pageId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete<void>(getPublicApiPageUrl(pageContext.pageId));
      window.location.href = pageContext.routePrefix ? getConfiguredSpaceHref(pageContext.routePrefix) : getSpaceHref(pageContext.space ?? 'wiki');
    } catch (err) {
      const error = err as ApiError;
      setDeleteError(error.message || t('editor.delete.error'));
      setIsDeleting(false);
    }
  };

  const requestRerender = () => {
    setRerenderError(null);
    setRerenderOpen(true);
  };

  // Re-renders the stored Markdown with the current pipeline. Nothing about the
  // page changes when the renderer produced the same HTML, so the reload simply
  // shows the page as it stands.
  const confirmRerender = async () => {
    if (!pageContext?.pageId) return;
    setIsRerendering(true);
    setRerenderError(null);
    try {
      await apiPost<Record<string, never>, unknown>(getPublicApiPageRenderingUrl(pageContext.pageId), {});
      window.location.reload();
    } catch (err) {
      const error = err as ApiError;
      setRerenderError(error.message || t('page.rerender.error'));
      setIsRerendering(false);
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
              {pageContext && pageContext.canPublish && pageContext.status === 'draft' && (
                <IconButton
                  onClick={handlePublish}
                  label={publishing ? t('page.header.publishing') : t('page.header.publish')}
                >
                  <PublishIcon />
                </IconButton>
              )}

              {pageContext && (
                <MoreActionsMenu
                  pageContext={pageContext}
                  showDelete={canDeletePage}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onRequestDelete={requestDelete}
                  onRequestRerender={requestRerender}
                  onTranslate={canTranslate ? () => setTranslateOpen(true) : undefined}
                />
              )}

              {(isOnUserCenter || isOnAdmin) ? (
                <IconButton onClick={() => goBack('/')} label={t('common.actions.back')}>
                  <ChevronLeftIcon />
                </IconButton>
              ) : isSignedIn && (role === 'editor' || role === 'admin') && (
                <IconButton href={getSpaceNewHref(pageContext?.space ?? 'wiki')} label={t('page.header.newPage')}>
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
      {settingsOpen && pageContext?.pageId && pageContext.revisionId && pageContext.slug !== undefined && (
        <PagePropertiesDialog
          pageId={pageContext.pageId}
          revisionId={pageContext.revisionId}
          initialTitle={pageContext.title}
          initialPath={pageContext.path}
          initialSlug={pageContext.slug}
          initialDate={pageContext.date ?? null}
          initialTags={pageContext.tags ?? []}
          initialSummary={pageContext.summary ?? null}
          initialVisibility={pageContext.visibility}
          canSetVisibility={role === 'admin'}
          pathReadOnly={Boolean(pageContext.currentLocale)}
          // 035 (FR-002): a path change is a tree move only — it never touches
          // the page's canonical address (slug), so the reader's current URL
          // stays valid regardless of what `savedPath` is. A reload is always
          // correct here; navigating to a URL built from the new tree path
          // would be wrong now that the address and the path can diverge.
          onSaved={() => window.location.reload()}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {rerenderOpen && pageContext?.pageId && (
        <ConfirmDialog
          title={t('page.rerender.title')}
          message={t('page.rerender.message')}
          confirmLabel={t('page.rerender.confirm')}
          pending={isRerendering}
          error={rerenderError ?? undefined}
          onConfirm={confirmRerender}
          // Cancel stays enabled while the request is in flight (ConfirmDialog
          // never traps the user), so drop the pending state with it — otherwise
          // reopening the dialog would show a permanently disabled confirm.
          onCancel={() => {
            setRerenderOpen(false);
            setIsRerendering(false);
          }}
        />
      )}
      {deleteOpen && pageContext?.pageId && (
        <ConfirmDialog
          title={t('editor.delete.title')}
          message={t('editor.delete.message', { title: pageContext.title })}
          confirmLabel={t('editor.delete.confirm')}
          confirmVariant="danger"
          pending={isDeleting}
          error={deleteError ?? undefined}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </header>
  );
}
