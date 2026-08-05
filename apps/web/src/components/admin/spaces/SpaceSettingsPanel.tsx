'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export type SpaceSettingsItem = {
  id: string;
  kind: 'wiki' | 'generated' | 'raw';
  displayName: string;
  routePrefix: string;
  defaultVisibility: 'public' | 'restricted';
  isActive: boolean;
};

export function SpaceSettingsPanel({ initialSpaces }: { initialSpaces: SpaceSettingsItem[] }) {
  const [spaces, setSpaces] = useState(initialSpaces);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function change(id: string, field: keyof Pick<SpaceSettingsItem, 'displayName' | 'routePrefix' | 'defaultVisibility'>, value: string) {
    setSpaces((current) => current.map((space) => space.id === id ? { ...space, [field]: value } : space));
  }

  async function save(space: SpaceSettingsItem) {
    setSavingId(space.id);
    setError(null);
    try {
      const response = await fetch(`/api/settings/spaces/${space.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: space.displayName,
          routePrefix: space.routePrefix,
          defaultVisibility: space.defaultVisibility,
        }),
      });
      const body = await response.json().catch(() => null) as Partial<SpaceSettingsItem> & { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Unable to save this space');
      setSpaces((current) => current.map((item) => item.id === space.id ? { ...item, ...body } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this space');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-md">
      {error ? <Alert>{error}</Alert> : null}
      {spaces.map((space) => (
        <section key={space.id} className="rounded-lg border border-border bg-surface p-md" aria-label={`${space.displayName} space settings`}>
          <div className="mb-md flex items-center justify-between gap-md">
            <div>
              <h2 className="font-medium">{space.displayName}</h2>
              <p className="text-sm text-muted">{space.kind} · {space.isActive ? 'Active' : 'Inactive in Copilot mode'}</p>
            </div>
            <Button variant="secondary" disabled={savingId === space.id} onClick={() => save(space)}>
              {savingId === space.id ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <div className="grid gap-md md:grid-cols-3">
            <label className="space-y-xs text-sm"><span>Display name</span><Input value={space.displayName} onChange={(event) => change(space.id, 'displayName', event.target.value)} /></label>
            <label className="space-y-xs text-sm"><span>URL prefix</span><Input value={space.routePrefix} onChange={(event) => change(space.id, 'routePrefix', event.target.value)} /></label>
            <label className="space-y-xs text-sm"><span>New page visibility</span><Select value={space.defaultVisibility} onChange={(event) => change(space.id, 'defaultVisibility', event.target.value)}><option value="restricted">Restricted</option><option value="public">Public</option></Select></label>
          </div>
        </section>
      ))}
    </div>
  );
}
