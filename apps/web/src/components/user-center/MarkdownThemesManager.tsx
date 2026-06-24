'use client';

import { useState } from 'react';
import type { MarkdownThemeListView, MarkdownThemeView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { MarkdownThemePreview } from '@/components/appearance/MarkdownThemePreview';
import { useTranslation } from '@/i18n/client';

export function MarkdownThemesManager({ initial }: { initial: MarkdownThemeListView }) {
  const { t } = useTranslation();
  const [themes, setThemes] = useState(initial.themes);
  const [activeThemeId, setActiveThemeId] = useState(initial.activeThemeId);
  const [detail, setDetail] = useState<MarkdownThemeView | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshList() {
    const res = await fetch('/api/markdown-themes');
    if (res.ok) {
      const data: MarkdownThemeListView = await res.json();
      setThemes(data.themes);
      setActiveThemeId(data.activeThemeId);
    }
  }

  async function selectTheme(id: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/markdown-themes/${id}`);
    if (!res.ok) {
      setError(t('userCenter.readingTheme.error.generic'));
      return;
    }
    const view: MarkdownThemeView = await res.json();
    setDetail(view);
    setDraftName(view.name);
    setDraftCss(view.css);
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch {
      setError(t('userCenter.readingTheme.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.message ?? t('userCenter.readingTheme.error.generic');
  }

  const activate = (id: string | null) =>
    withBusy(async () => {
      const res = await fetch('/api/markdown-themes/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId: id }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      await refreshList();
      setNotice(t('userCenter.readingTheme.activated'));
    });

  const copy = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch('/api/markdown-themes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceThemeId: detail.id, name: `${detail.name} copy` }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const created: MarkdownThemeView = await res.json();
      await refreshList();
      setDetail(created);
      setDraftName(created.name);
      setDraftCss(created.css);
      setNotice(t('userCenter.readingTheme.copied'));
    });

  const save = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch(`/api/markdown-themes/${detail.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: draftName, css: draftCss }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const updated: MarkdownThemeView = await res.json();
      setDetail(updated);
      setDraftCss(updated.css);
      await refreshList();
      setNotice(t('userCenter.readingTheme.saved'));
    });

  const remove = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch(`/api/markdown-themes/${detail.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setDetail(null);
      await refreshList();
      setNotice(t('userCenter.readingTheme.deleted'));
    });

  return (
    <div className="grid gap-lg md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-xs">
        {themes.map((theme) => {
          const isActive = theme.id === activeThemeId || (activeThemeId === null && theme.name === 'Default');
          const selected = detail?.id === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => selectTheme(theme.id)}
              className={`flex w-full items-center justify-between gap-sm rounded-md px-md py-sm text-left text-sm ${
                selected ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
              }`}
            >
              <span className="truncate">
                {theme.name}
                {theme.isBuiltin && <span className="ml-xs text-xs text-muted">({t('userCenter.readingTheme.builtin')})</span>}
              </span>
              {isActive && <span className="text-xs font-medium text-primary">{t('userCenter.readingTheme.active')}</span>}
            </button>
          );
        })}
      </aside>

      <section className="min-w-0">
        {!detail ? (
          <p className="text-sm text-muted">{t('userCenter.readingTheme.selectHint')}</p>
        ) : (
          <div className="grid gap-lg lg:grid-cols-2">
            {/* Editor */}
            <div className="space-y-sm">
              <div className="flex flex-wrap items-center gap-sm">
                {detail.owned ? (
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="max-w-xs"
                    aria-label={t('userCenter.readingTheme.nameLabel')}
                  />
                ) : (
                  <h2 className="font-display text-lg font-semibold">{detail.name}</h2>
                )}
                {detail.isBuiltin && (
                  <span className="text-xs text-muted">{t('userCenter.readingTheme.builtinReadonly')}</span>
                )}
              </div>

              <textarea
                value={draftCss}
                onChange={(e) => setDraftCss(e.target.value)}
                readOnly={!detail.owned}
                spellCheck={false}
                rows={18}
                className="w-full rounded-md border border-border bg-surface p-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                aria-label={t('userCenter.readingTheme.cssLabel')}
              />

              {error && <Alert>{error}</Alert>}
              {notice && (
                <div className="rounded-md bg-primary/10 p-sm text-sm text-primary" role="status">
                  {notice}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-sm">
                <Button onClick={() => activate(detail.id)} disabled={busy}>
                  {t('userCenter.readingTheme.activate')}
                </Button>
                <Button variant="secondary" onClick={copy} disabled={busy}>
                  {t('userCenter.readingTheme.copy')}
                </Button>
                {detail.owned && (
                  <>
                    <Button variant="secondary" onClick={save} disabled={busy}>
                      {t('userCenter.readingTheme.save')}
                    </Button>
                    <Button variant="ghost" onClick={remove} disabled={busy}>
                      {t('userCenter.readingTheme.delete')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Live preview */}
            <div className="lg:sticky lg:top-md lg:self-start">
              <MarkdownThemePreview css={draftCss} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
