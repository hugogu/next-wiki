'use client';

import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';

type Tag = { id: string; name: string };

/** A native, keyboard-accessible tag picker. It keeps the editor's compact
 * comma-separated value while offering the normalized tag registry as choices. */
export function TagPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const listId = useId();
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    void fetch('/api/v1/tags')
      .then((response) => response.ok ? response.json() as Promise<{ items: Tag[] }> : { items: [] })
      .then((result) => setTags(result.items))
      .catch(() => setTags([]));
  }, []);

  return (
    <>
      <Input
        id="prop-tags"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('editor.properties.fields.tagsPlaceholder')}
        aria-label={t('editor.properties.fields.tagsLabel')}
        list={listId}
      />
      <datalist id={listId}>
        {tags.map((tag) => <option key={tag.id} value={tag.name} />)}
      </datalist>
    </>
  );
}
