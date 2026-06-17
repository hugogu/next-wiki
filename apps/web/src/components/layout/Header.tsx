'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PageContext } from './types';
import type { Actor } from '@/server/permissions';
import {
  MenuIcon,
  PlusIcon,
  EditIcon,
  HistoryIcon,
  PublishIcon,
  EyeIcon,
  UsersIcon,
  LogOutIcon,
  LogInIcon,
} from '@/components/icons';
import { apiPost } from '@/lib/api/client';

function IconButton({
  href,
  onClick,
  label,
  children,
  active = false,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const baseClass =
    'inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50';
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
      aria-label={label}
      title={label}
      className={`${baseClass} ${stateClass}`}
    >
      {children}
    </button>
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
  const [publishing, setPublishing] = useState(false);
  const isSignedIn = user.kind === 'user';
  const role = isSignedIn ? user.role : null;

  const handlePublish = async () => {
    if (!pageContext || !pageContext.canPublish || pageContext.status === 'published') return;
    setPublishing(true);
    try {
      await apiPost<{ slug: string; version: number }, { versionId: string }>('/api/revisions/publish', {
        slug: pageContext.slug,
        version: pageContext.version,
      });
      window.location.href = `/${pageContext.slug}`;
    } catch {
      setPublishing(false);
    }
  };

  return (
    <header className="h-header shrink-0 bg-surface border-b border-border flex items-center justify-between px-md lg:px-lg">
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

      <div className="flex items-center gap-sm">
        {isSignedIn && (role === 'editor' || role === 'admin') && (
          <IconButton href="/new" label="New page">
            <PlusIcon />
          </IconButton>
        )}

        {pageContext && pageContext.canEdit && (
          <IconButton href={`/${pageContext.slug}/edit`} label="Edit page">
            <EditIcon />
          </IconButton>
        )}

        {pageContext && isSignedIn && (
          <IconButton href={`/${pageContext.slug}/history`} label="View history">
            <HistoryIcon />
          </IconButton>
        )}

        {pageContext && pageContext.canPublish && pageContext.status === 'draft' && (
          <IconButton onClick={handlePublish} label={publishing ? 'Publishing...' : 'Publish'}>
            <PublishIcon />
          </IconButton>
        )}

        {role === 'admin' && (
          <IconButton href="/admin/users" label="Admin">
            <UsersIcon />
          </IconButton>
        )}

        {pageContext && (
          <IconButton href={`/${pageContext.slug}`} label="View page" active>
            <EyeIcon />
          </IconButton>
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
