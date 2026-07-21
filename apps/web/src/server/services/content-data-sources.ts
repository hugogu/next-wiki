import { eq } from 'drizzle-orm';
import {
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
 * never silently inserted (constitution P10). */
const REGISTERED_SOURCES: SourceDefinition[] = [
  {
    sourceKey: WIKI_AI_CONVERSATIONS_SOURCE_KEY,
    category: 'content',
    label: 'Wiki AI Conversations',
    description: 'Capture new Wiki AI chats as Raw Conversation pages.',
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
  return Promise.all(REGISTERED_SOURCES.map((definition) => toView(definition, byKey.get(definition.sourceKey))));
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

/** Whether a registered source is enabled — used by write paths (e.g. the
 * wiki_question lifecycle) to decide whether to schedule capture. Existing
 * deployments with no row default to disabled. */
export async function isDataSourceEnabled(sourceKey: ContentDataSourceKey): Promise<boolean> {
  const row = await db.query.contentDataSourceSettings.findFirst({
    where: eq(schema.contentDataSourceSettings.sourceKey, sourceKey),
  });
  return row?.enabled ?? false;
}
