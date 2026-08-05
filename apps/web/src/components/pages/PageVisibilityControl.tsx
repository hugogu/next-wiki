'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

export function PageVisibilityControl({ pageId, initialVisibility }: { pageId: string; initialVisibility: 'public' | 'restricted' }) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/pages/${pageId}/visibility`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility }),
      });
      if (!response.ok) throw new Error('Unable to update visibility');
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update visibility');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-xs" data-testid="page-visibility-control">
      <Select aria-label="Page visibility" value={visibility} disabled={saving} onChange={(event) => setVisibility(event.target.value as 'public' | 'restricted')}>
        <option value="restricted">Restricted</option>
        <option value="public">Public</option>
      </Select>
      <Button variant="secondary" aria-label="Save page visibility" title="Save page visibility" disabled={saving || visibility === initialVisibility} onClick={save}>
        {saving ? '…' : 'Save'}
      </Button>
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
