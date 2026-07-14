import { eq } from 'drizzle-orm';
import {
  DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS,
  type SearchSettingsView,
  type UpdateSearchSettingsInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const SETTINGS_ID = 'default';
export const DEFAULT_SEARCH_SETTINGS: SearchSettingsView = {
  fullTextSearchEnabled: true,
  fuzzySearchEnabled: true,
  semanticSearchEnabled: true,
  immediateSearchTimeoutMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS,
  minRelevanceScore: 0,
  showExcerpts: true,
  excerptLength: 120,
  updatedAt: null,
};

type SearchSettingsRow = typeof schema.searchSettings.$inferSelect;

function assertAdmin(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage search settings');
  }
}

function scoreToStored(value: number): number {
  return Math.round(value * 100);
}

function scoreFromStored(value: number): number {
  return value / 100;
}

function toView(row: SearchSettingsRow | null | undefined): SearchSettingsView {
  if (!row) return DEFAULT_SEARCH_SETTINGS;
  return {
    fullTextSearchEnabled: row.fullTextSearchEnabled,
    fuzzySearchEnabled: row.fuzzySearchEnabled,
    semanticSearchEnabled: row.semanticSearchEnabled,
    immediateSearchTimeoutMs: row.immediateSearchTimeoutMs,
    minRelevanceScore: scoreFromStored(row.minRelevanceScore),
    showExcerpts: row.showExcerpts,
    excerptLength: row.excerptLength,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getRow(): Promise<SearchSettingsRow | null> {
  return (await db.query.searchSettings.findFirst({ where: eq(schema.searchSettings.id, SETTINGS_ID) })) ?? null;
}

export async function getSearchSettings(): Promise<SearchSettingsView> {
  return toView(await getRow());
}

export async function readSearchSettings(ctx: PermCtx): Promise<SearchSettingsView> {
  assertAdmin(ctx);
  return getSearchSettings();
}

export async function updateSearchSettings(
  ctx: PermCtx,
  input: UpdateSearchSettingsInput,
): Promise<SearchSettingsView> {
  assertAdmin(ctx);
  const current = toView(await getRow());
  const nextFullText = input.fullTextSearchEnabled ?? current.fullTextSearchEnabled;
  const nextFuzzy = input.fuzzySearchEnabled ?? current.fuzzySearchEnabled;
  // Semantic retrieval can never become the only way to search (FR-009); the
  // check constraint enforces this at the database, but validate here for a
  // clear domain error instead of a constraint violation.
  if (!nextFullText && !nextFuzzy) {
    throw new DomainError('BAD_REQUEST', 'At least one of full-text or fuzzy search must remain enabled');
  }
  const values = {
    ...(input.fullTextSearchEnabled !== undefined ? { fullTextSearchEnabled: input.fullTextSearchEnabled } : {}),
    ...(input.fuzzySearchEnabled !== undefined ? { fuzzySearchEnabled: input.fuzzySearchEnabled } : {}),
    ...(input.semanticSearchEnabled !== undefined ? { semanticSearchEnabled: input.semanticSearchEnabled } : {}),
    ...(input.immediateSearchTimeoutMs !== undefined ? { immediateSearchTimeoutMs: input.immediateSearchTimeoutMs } : {}),
    ...(input.minRelevanceScore !== undefined ? { minRelevanceScore: scoreToStored(input.minRelevanceScore) } : {}),
    ...(input.showExcerpts !== undefined ? { showExcerpts: input.showExcerpts } : {}),
    ...(input.excerptLength !== undefined ? { excerptLength: input.excerptLength } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.searchSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.searchSettings.id, set: values });
  return toView(await getRow());
}
