'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PublicPageResource } from '@next-wiki/shared';
import { ArrowUpDownIcon, EditIcon, PlusIcon, SearchIcon, TagIcon, TrashIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useTranslation } from '@/i18n/client';
import { getEditHref, getPageHref } from '@/lib/path';

type Tag = {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
};

type Mutation = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  affectedPageCount: number | null;
  failure: string | null;
};

type EditMode = 'rename' | 'merge' | null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
    throw new Error(payload?.message ?? payload?.error?.message ?? 'Request failed');
  }
  return response.json() as Promise<T>;
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const EMPTY_PAGES: PublicPageResource[] = [];

export function TagManager() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [pageResult, setPageResult] = useState<{ tagId: string; items: PublicPageResource[] }>({ tagId: '', items: [] });
  const [newName, setNewName] = useState('');
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [renameName, setRenameName] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadingTags, setLoadingTags] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTag = tags.find((tag) => tag.id === selectedId) ?? null;
  const selectedTagId = selectedTag?.id;
  const selectedTagNormalizedName = selectedTag?.normalizedName;
  const pages = pageResult.tagId === selectedTagId ? pageResult.items : EMPTY_PAGES;
  const loadingPages = Boolean(selectedTagId && pageResult.tagId !== selectedTagId);

  const loadTags = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      const result = await request<{ items: Tag[] }>(`/api/v1/tags?${params.toString()}`);
      setTags(result.items);
      setSelectedId((current) => current && result.items.some((tag) => tag.id === current)
        ? current
        : result.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('admin.tags.loadFailed'));
    } finally {
      setLoadingTags(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: '100' });
    void request<{ items: Tag[] }>(`/api/v1/tags?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setTags(result.items);
        setSelectedId(result.items[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : t('admin.tags.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingTags(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (!selectedTagId || !selectedTagNormalizedName) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ status: 'all', limit: '100' });
    params.set('filter[tag]', selectedTagNormalizedName);
    void request<{ items: PublicPageResource[] }>(`/api/v1/pages?${params.toString()}`, { signal: controller.signal })
      .then((result) => setPageResult({ tagId: selectedTagId, items: result.items }))
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setPageResult({ tagId: selectedTagId, items: [] });
          setError(loadError instanceof Error ? loadError.message : t('admin.tags.pagesLoadFailed'));
        }
      });
    return () => controller.abort();
  }, [selectedTagId, selectedTagNormalizedName, t]);

  const filteredPages = useMemo(() => {
    const query = pageQuery.trim().toLocaleLowerCase();
    if (!query) return pages;
    return pages.filter((page) => `${page.title} ${page.path}`.toLocaleLowerCase().includes(query));
  }, [pageQuery, pages]);

  const filteredTags = useMemo(() => {
    const query = tagQuery.trim().toLocaleLowerCase();
    if (!query) return tags;
    return tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query));
  }, [tagQuery, tags]);

  const trackMutation = useCallback(async (operation: Mutation, successMessage: string, nextSelectedId: string | null) => {
    try {
      let current = operation;
      for (let attempt = 0; attempt < 60 && (current.status === 'queued' || current.status === 'running'); attempt += 1) {
        await delay(500);
        current = await request<Mutation>(`/api/v1/tag-mutations/${current.id}`);
      }
      if (current.status === 'succeeded') {
        setMessage(t(successMessage as Parameters<typeof t>[0], { count: current.affectedPageCount ?? 0 }));
        await loadTags();
        setTagQuery('');
        setSelectedId(nextSelectedId);
      } else if (current.status === 'failed') {
        setError(current.failure ?? t('admin.tags.updateFailed'));
      } else {
        setMessage(t('admin.tags.operationPending'));
      }
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : t('admin.tags.updateFailed'));
    }
  }, [loadTags, t]);

  const create = async () => {
    if (!newName.trim()) return;
    setPending(true);
    setError(null);
    try {
      const tag = await request<Tag>('/api/v1/tags', { method: 'POST', body: JSON.stringify({ name: newName }) });
      setNewName('');
      setMessage(t('admin.tags.created'));
      setTagQuery('');
      await loadTags();
      setSelectedId(tag.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('admin.tags.createFailed'));
    } finally {
      setPending(false);
    }
  };

  const rename = async () => {
    if (!selectedTag || !renameName.trim()) return;
    setPending(true);
    setError(null);
    try {
      const operation = await request<Mutation>(`/api/v1/tags/${selectedTag.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: renameName }),
      });
      setEditMode(null);
      setMessage(t('admin.tags.operationQueued'));
      void trackMutation(operation, 'admin.tags.renamed', selectedTag.id);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : t('admin.tags.updateFailed'));
    } finally {
      setPending(false);
    }
  };

  const merge = async () => {
    if (!selectedTag || !mergeTargetId) return;
    setPending(true);
    setError(null);
    try {
      const operation = await request<Mutation>(`/api/v1/tags/${selectedTag.id}/merge`, {
        method: 'POST', body: JSON.stringify({ targetTagId: mergeTargetId }),
      });
      setEditMode(null);
      setMessage(t('admin.tags.operationQueued'));
      void trackMutation(operation, 'admin.tags.merged', mergeTargetId);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : t('admin.tags.updateFailed'));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!selectedTag) return;
    setPending(true);
    setError(null);
    try {
      const operation = await request<Mutation>(`/api/v1/tags/${selectedTag.id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      setMessage(t('admin.tags.operationQueued'));
      void trackMutation(operation, 'admin.tags.deleted', null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('admin.tags.updateFailed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-md" aria-label={t('admin.tags.ariaLabel')}>
      <section className="rounded-lg border border-border bg-surface p-md">
        <div className="flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">{t('admin.tags.createHeading')}</h2>
            <p className="mt-xs text-sm text-muted">{t('admin.tags.createDescription')}</p>
          </div>
          <form
            className="flex w-full gap-sm lg:max-w-lg"
            onSubmit={(event) => { event.preventDefault(); void create(); }}
          >
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t('admin.tags.newPlaceholder')}
              aria-label={t('admin.tags.newPlaceholder')}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-sm py-sm text-sm"
            />
            <button
              type="submit"
              disabled={pending || !newName.trim()}
              className="inline-flex items-center gap-xs rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              {t('admin.tags.create')}
            </button>
          </form>
        </div>
      </section>

      {(message || error) && (
        <div role="status" className={`rounded-md border px-md py-sm text-sm ${error ? 'border-danger/30 bg-danger/10 text-danger' : 'border-primary/20 bg-primary/10 text-foreground'}`}>
          {error ?? message}
        </div>
      )}

      <div className="grid min-h-[32rem] overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-md">
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={tagQuery}
                onChange={(event) => setTagQuery(event.target.value)}
                placeholder={t('admin.tags.searchPlaceholder')}
                aria-label={t('admin.tags.searchPlaceholder')}
                className="w-full rounded-md border border-border bg-background py-sm pl-9 pr-sm text-sm"
              />
            </label>
            <p className="mt-sm text-xs text-muted">{t('admin.tags.tagCount', { count: filteredTags.length })}</p>
          </div>
          <div className="max-h-[38rem] overflow-y-auto p-sm">
            {loadingTags ? (
              <p className="p-md text-sm text-muted">{t('common.status.loading')}</p>
            ) : filteredTags.length === 0 ? (
              <div className="p-lg text-center text-sm text-muted">
                <TagIcon className="mx-auto mb-sm h-8 w-8 opacity-50" />
                {t('admin.tags.empty')}
              </div>
            ) : (
              <ul className="space-y-xs">
                {filteredTags.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(tag.id); setPageQuery(''); setMessage(null); setError(null); }}
                      className={`flex w-full items-center gap-sm rounded-md px-sm py-sm text-left text-sm transition-colors ${selectedId === tag.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-surface-elevated'}`}
                    >
                      <TagIcon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          {!selectedTag ? (
            <div className="flex min-h-[32rem] items-center justify-center p-lg text-center text-sm text-muted">
              {t('admin.tags.selectHint')}
            </div>
          ) : (
            <>
              <div className="border-b border-border p-md lg:p-lg">
                <div className="flex flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-sm">
                      <TagIcon className="h-5 w-5 text-primary" />
                      <h2 className="truncate font-display text-xl font-semibold">{selectedTag.name}</h2>
                    </div>
                    <p className="mt-xs text-sm text-muted">{t('admin.tags.relatedSummary', { count: pages.length })}</p>
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    <button
                      type="button"
                      onClick={() => { setRenameName(selectedTag.name); setEditMode('rename'); }}
                      className="inline-flex h-9 items-center gap-xs rounded-md border border-border px-sm text-sm hover:bg-surface-elevated"
                    >
                      <EditIcon className="h-4 w-4" /> {t('admin.tags.rename')}
                    </button>
                    <button
                      type="button"
                      disabled={tags.length < 2}
                      onClick={() => { setMergeTargetId(tags.find((tag) => tag.id !== selectedTag.id)?.id ?? ''); setEditMode('merge'); }}
                      className="inline-flex h-9 items-center gap-xs rounded-md border border-border px-sm text-sm hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowUpDownIcon className="h-4 w-4" /> {t('admin.tags.merge')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      className="inline-flex h-9 items-center gap-xs rounded-md px-sm text-sm text-danger hover:bg-danger/10"
                    >
                      <TrashIcon className="h-4 w-4" /> {t('admin.tags.delete')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-md lg:p-lg">
                <div className="mb-md flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-display text-base font-semibold">{t('admin.tags.relatedPages')}</h3>
                  <label className="relative block w-full sm:max-w-sm">
                    <SearchIcon className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      value={pageQuery}
                      onChange={(event) => setPageQuery(event.target.value)}
                      placeholder={t('admin.tags.searchPagesPlaceholder')}
                      aria-label={t('admin.tags.searchPagesPlaceholder')}
                      className="w-full rounded-md border border-border bg-background py-sm pl-9 pr-sm text-sm"
                    />
                  </label>
                </div>

                {loadingPages ? (
                  <p className="py-lg text-center text-sm text-muted">{t('common.status.loading')}</p>
                ) : filteredPages.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-md py-xl text-center text-sm text-muted">
                    {pageQuery ? t('admin.tags.noMatchingPages') : t('admin.tags.noPages')}
                  </div>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {filteredPages.map((page) => (
                      <li key={page.id} className="flex items-center gap-md px-md py-sm hover:bg-surface-elevated/50">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={getPageHref(page.path)}
                            className="block truncate rounded-sm text-sm font-medium text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {page.title}
                          </Link>
                          <code className="block truncate text-xs text-muted">/{page.path}</code>
                          {(page.metadata?.tags?.length ?? 0) > 0 && (
                            <ul className="mt-xs flex flex-wrap gap-xs" aria-label={t('admin.tags.pageTagsLabel')}>
                              {page.metadata!.tags.map((tag) => (
                                <li
                                  key={tag.id}
                                  className={`inline-flex items-center gap-xs rounded-full border px-sm py-[2px] text-xs ${tag.normalizedName === selectedTagNormalizedName ? 'border-primary/30 bg-primary/10 font-medium text-primary' : 'border-border text-muted'}`}
                                >
                                  <TagIcon className="h-3 w-3" />
                                  {tag.name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <span className="hidden rounded-full border border-border px-sm py-xs text-xs text-muted sm:inline-block">
                          {t(`admin.pages.status.${page.status}`)}
                        </span>
                        <Link href={getEditHref(page.path)} aria-label={t('admin.pages.actions.edit')} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-elevated hover:text-foreground">
                          <EditIcon className="h-4 w-4" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {editMode === 'rename' && selectedTag && (
        <ModalDialog title={t('admin.tags.renameTitle')} description={t('admin.tags.renameDescription', { name: selectedTag.name })} onClose={() => !pending && setEditMode(null)} maxWidth="max-w-md">
          <form onSubmit={(event) => { event.preventDefault(); void rename(); }} className="space-y-md">
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.tags.nameLabel')}</span>
              <input autoComplete="off" value={renameName} onChange={(event) => setRenameName(event.target.value)} className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm" />
            </label>
            <div className="flex justify-end gap-sm">
              <button type="button" onClick={() => setEditMode(null)} className="rounded-md px-md py-sm text-sm text-muted hover:bg-surface-elevated">{t('common.actions.cancel')}</button>
              <button type="submit" disabled={pending || !renameName.trim()} className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-text disabled:opacity-50">{t('admin.tags.rename')}</button>
            </div>
          </form>
        </ModalDialog>
      )}

      {editMode === 'merge' && selectedTag && (
        <ModalDialog title={t('admin.tags.mergeTitle')} description={t('admin.tags.mergeDescription', { name: selectedTag.name })} onClose={() => !pending && setEditMode(null)} maxWidth="max-w-md">
          <form onSubmit={(event) => { event.preventDefault(); void merge(); }} className="space-y-md">
            <label className="block space-y-xs">
              <span className="text-sm font-medium">{t('admin.tags.mergeTarget')}</span>
              <select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} className="w-full rounded-md border border-border bg-background px-sm py-sm text-sm">
                {tags.filter((tag) => tag.id !== selectedTag.id).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <p className="rounded-md bg-surface-elevated px-sm py-sm text-xs text-muted">{t('admin.tags.mergeWarning')}</p>
            <div className="flex justify-end gap-sm">
              <button type="button" onClick={() => setEditMode(null)} className="rounded-md px-md py-sm text-sm text-muted hover:bg-surface-elevated">{t('common.actions.cancel')}</button>
              <button type="submit" disabled={pending || !mergeTargetId} className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-text disabled:opacity-50">{t('admin.tags.mergeConfirm')}</button>
            </div>
          </form>
        </ModalDialog>
      )}

      {deleteOpen && selectedTag && (
        <ConfirmDialog
          title={t('admin.tags.deleteTitle')}
          message={t('admin.tags.deleteDescription', { name: selectedTag.name, count: pages.length })}
          confirmLabel={t('admin.tags.delete')}
          confirmVariant="danger"
          pending={pending}
          error={error ?? undefined}
          onConfirm={() => void remove()}
          onCancel={() => !pending && setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
