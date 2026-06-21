'use client';

import { useState } from 'react';
import type { AiCapability, AiModelView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

const capabilityLabels: Record<AiCapability, TranslationKey> = {
  text_generation: 'admin.ai.capability.text_generation',
  embedding: 'admin.ai.capability.embedding',
  image_generation: 'admin.ai.capability.image_generation',
};

export function ModelCatalog({ models }: { models: AiModelView[] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState<AiCapability | ''>('');
  const capabilities: AiCapability[] = ['text_generation', 'embedding', 'image_generation'];
  const filtered = models.filter((model) => {
    const matchesQuery = !query || `${model.providerName} ${model.displayName} ${model.externalId}`.toLowerCase().includes(query.toLowerCase());
    const matchesCapability = !capabilityFilter || model.capabilities.some((item) => item.capability === capabilityFilter && item.supported);
    return matchesQuery && matchesCapability;
  });
  const toggle = async (model: AiModelView, capability: AiCapability, supported: boolean) => {
    setBusy(`${model.id}:${capability}`);
    await fetch(`/api/ai/models/${model.id}/capabilities/${capability}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supported, details: {} }),
    });
    window.location.reload();
  };
  return (
    <div className="space-y-sm">
      <div className="grid gap-sm sm:grid-cols-2">
        <input className="rounded-md border border-border bg-background px-md py-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter models" />
        <select className="rounded-md border border-border bg-background px-md py-sm" value={capabilityFilter} onChange={(event) => setCapabilityFilter(event.target.value as AiCapability | '')}>
          <option value="">All capabilities</option>
          {capabilities.map((capability) => <option key={capability} value={capability}>{t(capabilityLabels[capability])}</option>)}
        </select>
      </div>
      {filtered.map((model) => (
        <section key={model.id} className="rounded-lg border border-border bg-surface p-md">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div>
              <h2 className="font-medium">{model.displayName}</h2>
              <p className="text-xs text-muted">{model.providerName} · {model.externalId}</p>
            </div>
            <span className="text-xs text-muted">{model.availability}</span>
          </div>
          <div className="mt-sm flex flex-wrap gap-xs">
            {capabilities.map((capability) => {
              const current = model.capabilities.find((item) => item.capability === capability);
              return (
                <Button
                  key={capability}
                  size="default"
                  variant={current?.supported ? 'primary' : 'secondary'}
                  disabled={busy === `${model.id}:${capability}`}
                  onClick={() => void toggle(model, capability, !current?.supported)}
                >
                  {t(capabilityLabels[capability])}
                  {current?.source ? ` (${current.source})` : ''}
                </Button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
