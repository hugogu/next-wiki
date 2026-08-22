'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { PublicPageResource } from '@next-wiki/shared';
import { TagIcon, PlusIcon, XIcon } from '@/components/icons';
import { apiPut, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import type { PageTag } from './TagList';

/**
 * Flow-layout tag chips shared across the reader and admin lists. Read-only by
 * default; when `canEdit` and a `pageId` are provided, each chip gains a remove
 * (×) control and a `+` adder with autocomplete over existing tags.
 *
 * By default (`autoSave: true`) each add/remove is persisted immediately
 * (draft + immediate publish) via the page tags endpoint — right for a
 * standalone chip list like the reader sidebar. Pass `autoSave: false` for a
 * field embedded in a larger form (e.g. Page properties) that batches this
 * with other unsaved edits and owns when everything actually persists;
 * add/remove then only update local state and call `onChange`, with a
 * synthetic id (the tag name) standing in for the real one the server
 * assigns once the form is actually submitted.
 */
export function EditableTagList({
  tags,
  pageId,
  canEdit = false,
  tagHref,
  ariaLabel,
  onChange,
  autoSave = true,
}: {
  tags: PageTag[];
  pageId?: string;
  canEdit?: boolean;
  tagHref?: (tag: PageTag) => string;
  ariaLabel?: string;
  onChange?: (tags: PageTag[]) => void;
  autoSave?: boolean;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [current, setCurrent] = useState<PageTag[]>(tags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const editable = canEdit && (autoSave ? Boolean(pageId) : true);

  // Re-sync from props when the parent supplies a genuinely different tag set
  // (e.g. after a list refresh). Comparing by id signature avoids reacting to
  // fresh array references and keeps this a render-time adjustment, not an
  // effect that would cascade renders.
  const signature = tags.map((tag) => tag.id).join(',');
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setCurrent(tags);
  }

  // Lazily load the tag registry for autocomplete the first time editing starts.
  useEffect(() => {
    if (!adding || suggestions.length > 0) return;
    void fetch('/api/v1/tags?limit=100')
      .then((response) => (response.ok ? (response.json() as Promise<{ items: { name: string }[] }>) : { items: [] }))
      .then((result) => setSuggestions(result.items.map((item) => item.name)))
      .catch(() => setSuggestions([]));
  }, [adding, suggestions.length]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function save(nextNames: string[]) {
    if (!autoSave) {
      // No server round trip yet — the caller's form owns when this
      // actually persists. A synthetic id (the name itself) stands in for
      // the real one the server assigns on submit; nothing here depends on
      // it beyond the React key and (when supplied) tagHref.
      const next = nextNames.map((name) => ({ id: name, name, normalizedName: name.toLocaleLowerCase() }));
      setCurrent(next);
      onChange?.(next);
      return;
    }
    if (!pageId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<{ tags: string[] }, PublicPageResource>(
        `/api/v1/pages/${encodeURIComponent(pageId)}/tags`,
        { tags: nextNames },
      );
      const next = updated.metadata?.tags ?? [];
      setCurrent(next);
      onChange?.(next);
    } catch (cause) {
      setError((cause as ApiError).message || t('page.tags.saveError'));
    } finally {
      setSaving(false);
    }
  }

  function addTag(rawName: string) {
    const name = rawName.trim();
    setDraft('');
    setAdding(false);
    if (!name) return;
    if (current.some((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    void save([...current.map((tag) => tag.name), name]);
  }

  function removeTag(target: PageTag) {
    void save(current.filter((tag) => tag.id !== target.id).map((tag) => tag.name));
  }

  return (
    <div className="space-y-xs">
      <ul className="flex flex-wrap items-center gap-xs" aria-label={ariaLabel}>
        {current.map((tag) => {
          const label = (
            <>
              <TagIcon className="h-3 w-3 shrink-0" />
              {tag.name}
            </>
          );
          return (
            <li
              key={tag.id}
              className="inline-flex items-center gap-xs rounded-full border border-border px-sm py-[2px] text-xs text-muted transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              {tagHref ? (
                <Link href={tagHref(tag)} className="inline-flex items-center gap-xs">
                  {label}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-xs">{label}</span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={saving}
                  aria-label={t('page.tags.remove', { name: tag.name })}
                  className="ml-0.5 inline-flex items-center rounded-full text-muted hover:text-danger disabled:opacity-50"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </li>
          );
        })}

        {editable && (
          <li>
            {adding ? (
              <input
                ref={inputRef}
                value={draft}
                list={listId}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag(draft);
                  } else if (event.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                onBlur={() => addTag(draft)}
                placeholder={t('page.tags.addPlaceholder')}
                aria-label={t('page.tags.add')}
                className="w-28 rounded-full border border-border bg-background px-sm py-[2px] text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={saving}
                aria-label={t('page.tags.add')}
                title={t('page.tags.add')}
                className="inline-flex items-center gap-xs rounded-full border border-dashed border-border px-sm py-[2px] text-xs text-muted transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
              >
                <PlusIcon className="h-3 w-3" />
              </button>
            )}
            <datalist id={listId}>
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </li>
        )}
      </ul>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
