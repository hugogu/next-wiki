'use client';

import { useState } from 'react';
import type {
  SystemThemeListView,
  SystemThemeView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { SystemThemePreview } from './SystemThemePreview';

export function SystemThemeManager({ initial }: { initial: SystemThemeListView }) {
  const { t } = useTranslation();
  const [themes, setThemes] = useState(initial.themes);
  const [activeThemeId, setActiveThemeId] = useState(initial.activeThemeId);
  const [detail, setDetail] = useState<SystemThemeView | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshList() {
    const res = await fetch('/api/system-themes');
    if (res.ok) {
      const data: SystemThemeListView = await res.json();
      setThemes(data.themes);
      setActiveThemeId(data.activeThemeId);
    }
  }

  async function selectTheme(id: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/system-themes/${id}`);
    if (!res.ok) {
      setError(t('admin.appearance.error.generic'));
      return;
    }
    const view: SystemThemeView = await res.json();
    setDetail(view);
    setDraftName(view.name);
    setDraftCss(view.css);
  }

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.message ?? t('admin.appearance.error.generic');
  }

  const activate = (id: string | null) =>
    withBusy(async () => {
      const res = await fetch('/api/system-themes/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId: id }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      await refreshList();
      setNotice(t('admin.appearance.activated'));
    });

  const copy = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch('/api/system-themes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceThemeId: detail.id, name: `${detail.name} copy` }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const created: SystemThemeView = await res.json();
      await refreshList();
      setDetail(created);
      setDraftName(created.name);
      setDraftCss(created.css);
      setNotice(t('admin.appearance.copied'));
    });

  const save = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch(`/api/system-themes/${detail.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: draftName, css: draftCss }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const updated: SystemThemeView = await res.json();
      setDetail(updated);
      setDraftCss(updated.css);
      await refreshList();
      setNotice(t('admin.appearance.saved'));
    });

  const remove = () =>
    withBusy(async () => {
      if (!detail) return;
      const res = await fetch(`/api/system-themes/${detail.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setDetail(null);
      await refreshList();
      setNotice(t('admin.appearance.deleted'));
    });

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch {
      setError(t('admin.appearance.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-lg md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-xs">
        {themes.map((theme) => {
          const isActive = theme.id === activeThemeId;
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
                {theme.isBuiltin && (
                  <span className="ml-xs text-xs text-muted">({t('admin.appearance.builtin')})</span>
                )}
              </span>
              {isActive && (
                <span className="text-xs font-medium text-primary">
                  {t('admin.appearance.active')}
                </span>
              )}
            </button>
          );
        })}
      </aside>

      <section className="min-w-0">
        {!detail ? (
          <p className="text-sm text-muted">{t('admin.appearance.selectHint')}</p>
        ) : (
          <div className="grid gap-lg lg:grid-cols-2">
            <div className="space-y-sm">
              <div className="flex flex-wrap items-center gap-sm">
                {detail.isBuiltin ? (
                  <h2 className="font-display text-lg font-semibold">{detail.name}</h2>
                ) : (
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="max-w-xs"
                    aria-label={t('admin.appearance.nameLabel')}
                  />
                )}
                {detail.isBuiltin && (
                  <span className="text-xs text-muted">{t('admin.appearance.builtinReadonly')}</span>
                )}
              </div>

              <textarea
                value={draftCss}
                onChange={(e) => setDraftCss(e.target.value)}
                readOnly={detail.isBuiltin}
                spellCheck={false}
                rows={18}
                className="w-full rounded-md border border-border bg-surface p-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                aria-label={t('admin.appearance.cssLabel')}
              />

              {error && <Alert>{error}</Alert>}
              {notice && (
                <div className="rounded-md bg-primary/10 p-sm text-sm text-primary" role="status">
                  {notice}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-sm">
                {detail.isBuiltin ? (
                  <>
                    <Button onClick={() => activate(detail.id)} disabled={busy}>
                      {t('admin.appearance.activate')}
                    </Button>
                    <Button variant="secondary" onClick={copy} disabled={busy}>
                      {t('admin.appearance.copy')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => activate(detail.id)}
                      disabled={busy}
                      variant={detail.id === activeThemeId ? 'secondary' : 'primary'}
                    >
                      {detail.id === activeThemeId
                        ? t('admin.appearance.active')
                        : t('admin.appearance.activate')}
                    </Button>
                    <Button variant="secondary" onClick={copy} disabled={busy}>
                      {t('admin.appearance.copy')}
                    </Button>
                    <Button variant="secondary" onClick={save} disabled={busy}>
                      {t('admin.appearance.save')}
                    </Button>
                    <Button variant="ghost" onClick={remove} disabled={busy}>
                      {t('admin.appearance.delete')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="lg:sticky lg:top-md lg:self-start">
              <SystemThemePreview css={draftCss} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
