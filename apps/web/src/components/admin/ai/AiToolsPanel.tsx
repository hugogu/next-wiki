'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  AiToolCategory,
  AiToolListResponse,
  AiToolReviewPolicy,
  AiToolView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/keys';

const CATEGORIES: AiToolCategory[] = ['read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence'];
const REVIEW_POLICIES: AiToolReviewPolicy[] = [
  'always_review',
  'review_when_requested',
  'allow_immediate_for_owner',
];

function categoryKey(category: AiToolCategory): TranslationKey {
  return `admin.ai.tools.category.${category}` as TranslationKey;
}
function riskKey(risk: AiToolView['riskLevel']): TranslationKey {
  return `admin.ai.tools.risk.${risk}` as TranslationKey;
}
function reviewPolicyKey(policy: AiToolReviewPolicy): TranslationKey {
  return `admin.ai.tools.reviewPolicy.${policy}` as TranslationKey;
}
function effectiveReviewKey(review: AiToolView['effectiveReview']): TranslationKey {
  return `admin.ai.tools.effectiveReview.${review}` as TranslationKey;
}

export function AiToolsPanel({ initial }: { initial: AiToolListResponse }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tools, setTools] = useState<AiToolView[]>(initial.tools);
  const [savingTool, setSavingTool] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);

  const activeCategory = searchParams.get('category');
  const selectedCategory: AiToolCategory | null =
    activeCategory && (CATEGORIES as string[]).includes(activeCategory)
      ? (activeCategory as AiToolCategory)
      : null;

  const setCategory = useCallback(
    (category: AiToolCategory | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (category) params.set('category', category);
      else params.delete('category');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const refresh = useCallback(async () => {
    const response = await fetch('/api/ai/tools');
    if (response.ok) {
      const data = (await response.json()) as AiToolListResponse;
      setTools(data.tools);
    }
  }, []);

  const savePolicy = useCallback(
    async (tool: AiToolView, patch: { enabled?: boolean; reviewPolicy?: AiToolReviewPolicy }) => {
      setSavingTool(tool.name);
      setMessage(null);
      try {
        const response = await fetch('/api/ai/tools/policies', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ providerKey: tool.providerKey, toolName: tool.name, ...patch }),
        });
        if (!response.ok) throw new Error('save failed');
        await refresh();
        setMessage({ kind: 'saved', text: t('admin.ai.tools.policy.saved') });
      } catch {
        setMessage({ kind: 'error', text: t('admin.ai.tools.policy.saveError') });
      } finally {
        setSavingTool(null);
      }
    },
    [refresh, t],
  );

  const visibleTools = useMemo(
    () => (selectedCategory ? tools.filter((tool) => tool.category === selectedCategory) : tools),
    [tools, selectedCategory],
  );

  return (
    <div className="space-y-lg">
      {/* Providers */}
      <section aria-labelledby="tools-providers-heading" className="space-y-sm">
        <h2 id="tools-providers-heading" className="text-sm font-semibold">
          {t('admin.ai.tools.providers')}
        </h2>
        <ul className="flex flex-wrap gap-sm">
          {initial.providers.map((provider) => {
            const external = provider.kind === 'external_mcp';
            return (
              <li
                key={provider.key}
                className={`min-w-[16rem] rounded-lg border px-md py-sm ${
                  external ? 'border-dashed border-border' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-sm">
                  <span className="text-sm font-medium">{provider.displayName}</span>
                  <Pill>
                    {t(external ? 'admin.ai.tools.provider.external' : 'admin.ai.tools.provider.builtin')}
                  </Pill>
                  <span className="text-xs text-muted">
                    {t(
                      provider.enabled
                        ? 'admin.ai.tools.provider.enabled'
                        : 'admin.ai.tools.provider.disabled',
                    )}
                  </span>
                </div>
                {external ? (
                  <p className="mt-xs text-xs text-muted">
                    {t('admin.ai.tools.provider.externalUnavailable')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Category filter (URL-restorable) */}
      <div className="flex flex-wrap gap-xs" role="tablist" aria-label={t('admin.ai.tools.table.category')}>
        <FilterChip active={selectedCategory === null} onClick={() => setCategory(null)}>
          {t('admin.ai.tools.allCategories')}
        </FilterChip>
        {CATEGORIES.map((category) => (
          <FilterChip
            key={category}
            active={selectedCategory === category}
            onClick={() => setCategory(category)}
          >
            {t(categoryKey(category))}
          </FilterChip>
        ))}
      </div>

      {message ? (
        <p role="status" className={`text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
          {message.text}
        </p>
      ) : null}

      {/* Tools table */}
      <DataTable>
        <DataTableHead>
          <tr className="text-xs uppercase tracking-wide text-muted">
            <DataTableHeader>{t('admin.ai.tools.table.tool')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.tools.table.category')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.tools.table.risk')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.tools.table.scope')}</DataTableHeader>
            <DataTableHeader>{t('admin.ai.tools.table.review')}</DataTableHeader>
            <DataTableHeader align="center">{t('admin.ai.tools.table.enabled')}</DataTableHeader>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {visibleTools.map((tool) => (
            <DataTableRow key={tool.name}>
              <DataTableCell>
                <div className="text-sm font-medium">{tool.name}</div>
                {tool.description ? (
                  <div className="mt-0.5 max-w-md text-xs text-muted">{tool.description}</div>
                ) : null}
              </DataTableCell>
              <DataTableCell>
                <Pill>{t(categoryKey(tool.category))}</Pill>
              </DataTableCell>
              <DataTableCell className="text-sm text-muted">{t(riskKey(tool.riskLevel))}</DataTableCell>
              <DataTableCell className="text-sm text-muted">{tool.requiredScope}</DataTableCell>
              <DataTableCell>
                {tool.riskLevel === 'read' ? (
                  <span className="text-sm text-muted">{t(effectiveReviewKey('none'))}</span>
                ) : (
                  <Select
                    containerClassName="max-w-[15rem]"
                    aria-label={`${tool.name} ${t('admin.ai.tools.policy.reviewPolicy')}`}
                    value={tool.reviewPolicy}
                    disabled={savingTool === tool.name}
                    onChange={(event) =>
                      savePolicy(tool, { reviewPolicy: event.target.value as AiToolReviewPolicy })
                    }
                  >
                    {REVIEW_POLICIES.map((policy) => (
                      <option key={policy} value={policy}>
                        {t(reviewPolicyKey(policy))}
                      </option>
                    ))}
                  </Select>
                )}
              </DataTableCell>
              <DataTableCell align="center">
                <Switch
                  checked={tool.enabled}
                  disabled={savingTool === tool.name}
                  aria-label={`${tool.name} ${t('admin.ai.tools.table.enabled')}`}
                  onClick={() => savePolicy(tool, { enabled: !tool.enabled })}
                />
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {/* Recent tool failures */}
      <section aria-labelledby="tools-failures-heading" className="space-y-sm">
        <h2 id="tools-failures-heading" className="text-sm font-semibold">
          {t('admin.ai.tools.failures.title')}
        </h2>
        <p className="text-sm text-muted">{t('admin.ai.tools.failures.empty')}</p>
      </section>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-elevated px-sm py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'primary' : 'secondary'}
      size="default"
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
