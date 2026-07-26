'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SkillDetail as SkillDetailView, SkillFileContent } from '@next-wiki/shared';
import { apiDelete, apiGet, apiPost, apiPut, type ApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { CodeEditor, languageForContentType } from '@/components/ui/CodeEditor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useTranslation } from '@/i18n/client';

/**
 * Browse and edit one skill's files (028, US4).
 *
 * The selected file lives in a `?file=` search param rather than component
 * state, so the view is linkable and browser back/forward work — constitution
 * P11 treats a reachable state without a URL as an anti-pattern.
 */
export function SkillDetail({ skill }: { skill: SkillDetailView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPath = searchParams.get('file') ?? skill.files[0]?.path ?? null;

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const queryClient = useQueryClient();

  const selected = skill.files.find((item) => item.path === selectedPath) ?? null;

  const select = (path: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('file', path);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Server state goes through TanStack Query per the project's frontend data
  // flow mandate; only the unsaved draft is local UI state.
  const queryKey = ['skill-file', skill.name, selectedPath] as const;
  const { data: file = null, error: loadError } = useQuery({
    queryKey,
    enabled: Boolean(selectedPath) && selected?.viewable === true,
    queryFn: () =>
      apiGet<SkillFileContent>(`/api/ai/skills/${skill.name}/files/${selectedPath}`),
  });

  // Re-seed the editor when a different file — or a newer revision of the same
  // one — arrives. Adjusting during render rather than in an effect is React's
  // documented pattern for state derived from changing input: an effect would
  // paint the previous file's contents for one frame first.
  const fileKey = file ? `${file.path}@${file.revision ?? 0}` : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (fileKey !== seededFor) {
    setSeededFor(fileKey);
    setDraft(file?.content ?? '');
    setNotice(null);
  }

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // The revision the editor loaded travels with the write, so a colleague's
      // concurrent save is reported rather than silently overwritten.
      const updated = await apiPut<
        { content: string; revision?: number },
        SkillFileContent
      >(`/api/ai/skills/${skill.name}/files/${file.path}`, {
        content: draft,
        revision: file.revision ?? undefined,
      });
      queryClient.setQueryData(queryKey, updated);
      setDraft(updated.content);
      setNotice(t('admin.ai.skills.saved'));
      router.refresh();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.skills.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/ai/skills/${skill.name}/files/${file.path}`);
      await queryClient.invalidateQueries({ queryKey: ['skill-file', skill.name] });
      router.push(pathname);
      router.refresh();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.skills.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/ai/skills/${skill.name}/reset`, {});
      setResetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['skill-file', skill.name] });
      router.refresh();
    } catch (value) {
      setError((value as ApiError).message ?? t('admin.ai.skills.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const dirty = file !== null && draft !== file.content;

  return (
    <div className="flex flex-col gap-lg">
      <BackLink fallbackHref="/admin/ai/skills">{t('admin.ai.skills.backToList')}</BackLink>

      <header className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h2 className="text-lg font-medium">{skill.name}</h2>
          <p className="text-sm text-muted">{skill.description}</p>
          <div className="mt-xs flex flex-wrap gap-xs">
            <StatusBadge tone={skill.source === 'directory' ? 'info' : 'neutral'}>
              {t(`admin.ai.skills.sourceLabel.${skill.source}` as never)}
            </StatusBadge>
            {skill.overridden && (
              <StatusBadge tone="warning">{t('admin.ai.skills.overridden')}</StatusBadge>
            )}
            {!skill.editable && (
              <StatusBadge tone="neutral">{t('admin.ai.skills.readOnly')}</StatusBadge>
            )}
          </div>
        </div>
        {skill.source === 'builtin' && skill.overridden && (
          <Button variant="secondary" onClick={() => setResetOpen(true)}>
            {t('admin.ai.skills.reset')}
          </Button>
        )}
      </header>

      {!skill.editable && (
        <p className="rounded-md border border-border p-md text-sm text-muted">
          {t('admin.ai.skills.readOnlyHint')}
        </p>
      )}
      {(error ?? loadError) && (
        <Alert>{error ?? t('admin.ai.skills.error.generic')}</Alert>
      )}
      {notice && <p className="text-sm text-muted">{notice}</p>}

      <div className="grid gap-lg md:grid-cols-[16rem_1fr]">
        <nav aria-label={t('admin.ai.skills.files')} className="flex flex-col gap-xs">
          {skill.files.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => select(item.path)}
              className={`rounded-md px-sm py-xs text-left text-xs ${
                item.path === selectedPath ? 'bg-surface-elevated font-medium' : 'text-muted'
              }`}
            >
              <span className="block truncate">{item.path}</span>
              {!item.viewable && (
                <span className="text-muted">
                  {t('admin.ai.skills.notViewable', {
                    type: item.contentType,
                    size: item.byteSize,
                  })}
                </span>
              )}
            </button>
          ))}
        </nav>

        <section className="flex flex-col gap-sm">
          {!selected ? (
            <p className="text-sm text-muted">{t('admin.ai.skills.selectFile')}</p>
          ) : !selected.viewable ? (
            // Listed by name, type, and size rather than opened: the rest of the
            // tree keeps working (FR-037).
            <p className="rounded-md border border-border p-md text-sm text-muted">
              {t('admin.ai.skills.notViewableDetail', {
                path: selected.path,
                type: selected.contentType,
                size: selected.byteSize,
              })}
            </p>
          ) : (
            <>
              {selected.kind === 'script' && (
                <p className="rounded-md border border-border p-md text-sm text-muted">
                  {t('admin.ai.skills.scriptHint')}
                </p>
              )}
              <CodeEditor
                value={draft}
                onChange={setDraft}
                language={languageForContentType(selected.contentType)}
                readOnly={!skill.editable}
                ariaLabel={`${skill.name}: ${selected.path}`}
              />
              {skill.editable && (
                <div className="flex justify-end gap-sm">
                  {selected.path !== 'SKILL.md' && (
                    <Button variant="secondary" disabled={busy} onClick={() => void removeFile()}>
                      {t('admin.ai.skills.deleteFile')}
                    </Button>
                  )}
                  <Button disabled={busy || !dirty} onClick={() => void save()}>
                    {busy ? t('common.status.saving') : t('common.actions.save')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {resetOpen && (
        <ConfirmDialog
          title={t('admin.ai.skills.reset')}
          message={t('admin.ai.skills.resetConfirm')}
          confirmLabel={t('admin.ai.skills.reset')}
          pending={busy}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => void reset()}
        />
      )}
    </div>
  );
}
