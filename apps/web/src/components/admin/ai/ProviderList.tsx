import Link from 'next/link';
import type { AiProviderView } from '@next-wiki/shared';

export function ProviderList({ providers }: { providers: AiProviderView[] }) {
  return (
    <div className="grid gap-sm">
      {providers.map((provider) => (
        <Link key={provider.id} href={`/admin/ai/providers/${provider.id}`} className="rounded-lg border border-border bg-surface p-md hover:bg-surface-elevated">
          <div className="flex items-center justify-between">
            <span className="font-medium">{provider.name}</span>
            <span className="text-xs text-muted">{provider.status}</span>
          </div>
          <div className="mt-xs text-sm text-muted">{provider.kind} · {provider.baseUrl}</div>
        </Link>
      ))}
    </div>
  );
}
