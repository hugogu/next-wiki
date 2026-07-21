import { eq } from 'drizzle-orm';
import {
  AI_CONVERSATIONS_SOURCE_KEY,
  WIKI_AI_CONVERSATIONS_SOURCE_KEY,
  type ContentDataSourceItem,
  type ContentDataSourceKey,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { isLlmWikiMode } from '@/server/services/writing-mode';

type SourceDefinition = {
  sourceKey: ContentDataSourceKey;
  category: 'content';
  label: string;
  description: string;
  /** Resolves whether the source can currently operate (independent of its
   * enabled flag) — e.g. Raw content requires LLM Wiki writing mode. */
  isAvailable: () => Promise<boolean>;
  unavailableReason: string;
};

/** Registered Content > Data Sources. Only keys listed here are ever
 * read/updated through this service — an unregistered key is always rejected,
 * never silently inserted (constitution P10). The legacy
 * `WIKI_AI_CONVERSATIONS_SOURCE_KEY` is intentionally NOT registered here
 * (025): it is a read-only alias resolved by `isDataSourceEnabled` during the
 * lazy migration, never a second writable Admin-facing entry. */
const REGISTERED_SOURCES: SourceDefinition[] = [
  {
    sourceKey: AI_CONVERSATIONS_SOURCE_KEY,
    category: 'content',
    label: 'AI Conversations',
    description: 'Capture every AI conversation — Wiki AI and Feishu bot — as Raw Conversation pages.',
    isAvailable: isLlmWikiMode,
    unavailableReason: 'Raw content requires LLM Wiki writing mode',
  },
];

function findDefinition(sourceKey: string): SourceDefinition | undefined {
  return REGISTERED_SOURCES.find((source) => source.sourceKey === sourceKey);
}

function assertAdmin(ctx: PermCtx): string {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage content data sources');
  }
  const userId = getActorUserId(ctx);
  if (!userId) throw new DomainError('UNAUTHORIZED', 'Sign in to manage content data sources');
  return userId;
}

type SettingsRow = typeof schema.contentDataSourceSettings.$inferSelect;

/**
 * 025: one-shot lazy migration for the `wiki-ai-conversations` →
 * `ai-conversations` rename. If the canonical row is missing but the legacy
 * row exists, its `enabled` state is copied forward so every existing
 * deployment keeps the same effective switch across the rename. The legacy
 * row is left untouched (never deleted, never surfaced to the Admin UI).
 */
async function migrateLegacyRowIfNeeded(row: SettingsRow | undefined): Promise<SettingsRow | undefined> {
  if (row) return row;
  const legacy = await db.query.contentDataSourceSettings.findFirst({
    where: eq(schema.contentDataSourceSettings.sourceKey, WIKI_AI_CONVERSATIONS_SOURCE_KEY),
  });
  if (!legacy) return undefined;
  const [migrated] = await db
    .insert(schema.contentDataSourceSettings)
    .values({ sourceKey: AI_CONVERSATIONS_SOURCE_KEY, enabled: legacy.enabled, updatedBy: legacy.updatedBy })
    .onConflictDoNothing()
    .returning();
  // A concurrent migration may have already inserted the row; re-read it so
  // the returned row always reflects the persisted state.
  return (
    migrated ??
    (await db.query.contentDataSourceSettings.findFirst({
      where: eq(schema.contentDataSourceSettings.sourceKey, AI_CONVERSATIONS_SOURCE_KEY),
    }))
  );
}

async function toView(definition: SourceDefinition, row: SettingsRow | undefined): Promise<ContentDataSourceItem> {
  const available = await definition.isAvailable();
  return {
    sourceKey: definition.sourceKey,
    category: definition.category,
    label: definition.label,
    description: definition.description,
    enabled: row?.enabled ?? false,
    available,
    unavailableReason: available ? null : definition.unavailableReason,
    updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
  };
}

export async function listDataSources(ctx: PermCtx): Promise<ContentDataSourceItem[]> {
  assertAdmin(ctx);
  const rows = await db.query.contentDataSourceSettings.findMany();
  const byKey = new Map(rows.map((row) => [row.sourceKey, row]));
  return Promise.all(
    REGISTERED_SOURCES.map(async (definition) => toView(definition, await migrateLegacyRowIfNeeded(byKey.get(definition.sourceKey)))),
  );
}

export async function updateDataSource(
  ctx: PermCtx,
  sourceKey: string,
  patch: { enabled: boolean },
): Promise<ContentDataSourceItem> {
  const userId = assertAdmin(ctx);
  const definition = findDefinition(sourceKey);
  if (!definition) throw new DomainError('NOT_FOUND', 'Unknown content data source');

  if (patch.enabled) {
    const available = await definition.isAvailable();
    if (!available) {
      throw new DomainError('DATA_SOURCE_UNAVAILABLE', definition.unavailableReason);
    }
  }

  const [row] = await db
    .insert(schema.contentDataSourceSettings)
    .values({ sourceKey: definition.sourceKey, enabled: patch.enabled, updatedBy: userId })
    .onConflictDoUpdate({
      target: schema.contentDataSourceSettings.sourceKey,
      set: { enabled: patch.enabled, updatedBy: userId, updatedAt: new Date() },
    })
    .returning();
  return toView(definition, row);
}

/**
 * Whether a registered source is enabled — used by write paths (e.g. the
 * wiki_question lifecycle) to decide whether to schedule capture. Existing
 * deployments with no row default to disabled.
 *
 * 025: for `AI_CONVERSATIONS_SOURCE_KEY`, this also performs a one-shot lazy
 * migration — if the new-key row does not exist yet but the legacy
 * `wiki-ai-conversations` row does, its `enabled` state is copied forward so
 * every existing deployment keeps the same effective switch across the
 * rename. The legacy row is left untouched (never deleted) and is never
 * surfaced through `listDataSources`.
 */
export async function isDataSourceEnabled(sourceKey: ContentDataSourceKey): Promise<boolean> {
  const row = await db.query.contentDataSourceSettings.findFirst({
    where: eq(schema.contentDataSourceSettings.sourceKey, sourceKey),
  });
  return (await migrateLegacyRowIfNeeded(row))?.enabled ?? false;
}
