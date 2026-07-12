'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/client';

type Tag = { id: string; name: string; normalizedName: string };
type Mutation = { id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; failure: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ message: 'Request failed' }))).message ?? 'Request failed');
  return response.json() as Promise<T>;
}

export function TagManager() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => {
    try { setTags((await request<{ items: Tag[] }>('/api/v1/tags')).items); } catch (error) { setMessage(error instanceof Error ? error.message : t('admin.tags.loadFailed')); }
  };
  useEffect(() => { void load(); }, []);
  const create = async () => {
    try { await request<Tag>('/api/v1/tags', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); setMessage(t('admin.tags.created')); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : t('admin.tags.createFailed')); }
  };
  const mutate = async (tag: Tag, method: 'PATCH' | 'DELETE') => {
    const nextName = method === 'PATCH' ? window.prompt(t('admin.tags.renamePrompt'), tag.name) : null;
    if (method === 'PATCH' && !nextName) return;
    try {
      const operation = await request<Mutation>(`/api/v1/tags/${tag.id}`, { method, ...(nextName ? { body: JSON.stringify({ name: nextName }) } : {}) });
      setMessage(t('admin.tags.operation', { status: operation.status }));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : t('admin.tags.updateFailed')); }
  };
  return (
    <section className="rounded-md border border-border bg-surface p-md" aria-label={t('admin.tags.ariaLabel')}>
      <h2 className="font-display text-lg font-semibold">{t('admin.tags.heading')}</h2>
      <div className="mt-sm flex gap-sm">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin.tags.newPlaceholder')} aria-label={t('admin.tags.newPlaceholder')} className="min-w-0 flex-1 rounded-md border border-border bg-background px-sm py-sm text-sm" />
        <button type="button" onClick={() => void create()} className="rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-text">{t('admin.tags.create')}</button>
      </div>
      {message && <p className="mt-xs text-xs text-muted">{message}</p>}
      <ul className="mt-sm flex flex-wrap gap-xs">
        {tags.map((tag) => (
          <li key={tag.id} className="inline-flex items-center gap-xs rounded-full border border-border px-sm py-xs text-sm">
            <span>{tag.name}</span>
            <button type="button" onClick={() => void mutate(tag, 'PATCH')} className="text-primary hover:underline">{t('admin.tags.rename')}</button>
            <button type="button" onClick={() => void mutate(tag, 'DELETE')} className="text-danger hover:underline">{t('admin.tags.delete')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
