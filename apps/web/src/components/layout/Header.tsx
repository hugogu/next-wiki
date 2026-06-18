'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PageContext } from './types';
import type { Actor } from '@/server/permissions';
import { useEditor } from '@/components/editor/EditorContext';
import {
  MenuIcon,
  PlusIcon,
  EditIcon,
  HistoryIcon,
  PublishIcon,
  EyeIcon,
  SettingsIcon,
  ShieldIcon,
  LogOutIcon,
  LogInIcon,
  SaveIcon,
  XIcon,
} from '@/components/icons';
import { apiPost } from '@/lib/api/client';
import { getPageHref, getEditHref, getHistoryHref, getPropertiesHref } from '@/lib/path';

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
  return (
    <>
      <IconButton onClick={editor.save} label="Save" disabled={editor.isSaving}>
        <SaveIcon />
      </IconButton>
      <IconButton onClick={editor.close} label="Close">
        <XIcon />
      </IconButton>
      <IconButton
        onClick={editor.toggleProperties}
        label="Page properties"
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

  const title = editor
    ? editor.title.trim() || editor.defaultTitle
    : pageContext?.title ?? null;

  return (
    <header className="h-header shrink-0 bg-surface border-b border-border flex items-center justify-between px-md lg:px-lg relative">
      <div className="flex items-center gap-md">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          aria-label="Open navigator"
        >
          <MenuIcon />
        </button>
        <Link href="/" className="font-display text-xl font-semibold text-foreground tracking-tight">
          next-wiki
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
                <IconButton href={getEditHref(pageContext.path)} label="Edit page">
                  <EditIcon />
                </IconButton>
              )}

              {pageContext && isSignedIn && (
                <IconButton href={getHistoryHref(pageContext.path)} label="View history">
                  <HistoryIcon />
                </IconButton>
              )}

              {pageContext && pageContext.canPublish && pageContext.status === 'draft' && (
                <IconButton onClick={handlePublish} label={publishing ? 'Publishing...' : 'Publish'}>
                  <PublishIcon />
                </IconButton>
              )}

              {pageContext && pageContext.canEdit && (
                <IconButton href={getPropertiesHref(pageContext.path)} label="Page properties">
                  <SettingsIcon />
                </IconButton>
              )}

              {pageContext && (
                <IconButton href={getPageHref(pageContext.path)} label="View page" active>
                  <EyeIcon />
                </IconButton>
              )}
            </div>

            <div className="flex items-center gap-sm">
              {isSignedIn && (role === 'editor' || role === 'admin') && (
                <IconButton href="/new" label="New page">
                  <PlusIcon />
                </IconButton>
              )}

              {role === 'admin' && (
                <IconButton href="/admin/users" label="Admin">
                  <ShieldIcon />
                </IconButton>
              )}
            </div>
          </>
        )}

        {isSignedIn ? (
          <form
            action="/api/auth/logout"
            method="POST"
            onSubmit={async (e) => {
              e.preventDefault();
              await apiPost('/api/auth/logout', {});
              window.location.href = '/';
            }}
          >
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <LogOutIcon />
            </button>
          </form>
        ) : (
          <IconButton href="/auth/login" label="Sign in">
            <LogInIcon />
          </IconButton>
        )}
      </div>
    </header>
  );
}
