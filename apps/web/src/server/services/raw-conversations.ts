import { asc, and, eq, max, sql } from 'drizzle-orm';
import {
  isLegacyInsufficientWikiAnswer,
  rawConversationSourceMetadataSchema,
  type AiActionStatus,
  type AiCitation,
  type ConversationSessionTurn,
  type ConversationSessionViewModel,
  type ConversationStatus,
  type RawConversationSourceMetadata,
  type WikiAiChannel,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { renderMarkdown } from '@/server/pipeline';
import { persistRevisionMetadata } from '@/server/services/page-metadata';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { resolveSpace } from '@/server/services/spaces';
import { ensureSystemCategory } from '@/server/services/raw-categories';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { runWithoutDataCache } from '@/server/cache/public-cache';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AiActionRow = typeof schema.aiActions.$inferSelect;
// `wiki_tool_chat` is legacy compatibility for rows created before tool-enabled
// Wiki AI was folded back into the canonical `wiki_question` feature.
type CapturableConversationFeature = 'wiki_question' | 'wiki_tool_chat';

export const CONVERSATION_CATEGORY_SYSTEM_KEY = 'conversation';

function mapConversationStatus(status: AiActionStatus): ConversationStatus {
  return status === 'queued' ? 'running' : status;
}

export type ReconstructedConversation = {
  status: ConversationStatus;
  question: string;
  answer: string;
  thinking: string;
  citations: AiCitation[];
  toolCalls: {
    toolName: string;
    status: string;
    commandMarkdown: string;
  }[];
  insufficient: boolean;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Highest ai_action_events.id folded into this reconstruction; 0 means no
   * events exist yet (nothing worth capturing). */
  eventCursor: number;
};

type CapturedConversationTurn = {
  action: AiActionRow;
  conversation: ReconstructedConversation;
};

type ConversationSessionKey =
  | { field: 'webSessionId'; value: string }
  | { field: 'feishuSessionId'; value: string };

function isCapturableFeature(feature: string): feature is CapturableConversationFeature {
  return feature === 'wiki_question' || feature === 'wiki_tool_chat';
}

/**
 * Rebuilds a full, self-contained conversation view from an action's entire
 * event log (not just events after the last capture cursor) — each captured
 * Raw revision must stand alone as a complete transcript, matching how the
 * AI Chat History detail view reconstructs the same session.
 */
export async function reconstructConversation(actionId: string, tx: Tx | typeof db = db): Promise<ReconstructedConversation | null> {
  const action = await tx.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!action || !isCapturableFeature(action.feature)) return null;

  const events = await tx
    .select()
    .from(schema.aiActionEvents)
    .where(eq(schema.aiActionEvents.actionId, actionId))
    .orderBy(asc(schema.aiActionEvents.id));

  let question = '';
  let answer = '';
  let thinking = '';
  let citations: AiCitation[] = [];
  const toolCalls: ReconstructedConversation['toolCalls'] = [];
  let errorMessage: string | null = null;
  let eventCursor = 0;
  for (const event of events) {
    eventCursor = event.id;
    const payload = event.payload as Record<string, unknown>;
    switch (event.type) {
      case 'question':
        question = typeof payload.text === 'string' ? payload.text : '';
        break;
      case 'text_delta':
        answer += typeof payload.text === 'string' ? payload.text : '';
        break;
      case 'reasoning_delta':
        thinking += typeof payload.text === 'string' ? payload.text : '';
        break;
      case 'citations':
        citations = Array.isArray(payload.citations) ? (payload.citations as AiCitation[]) : [];
        break;
      case 'tool_call':
        toolCalls.push({
          toolName: typeof payload.toolName === 'string' ? payload.toolName : 'tool',
          status: typeof payload.status === 'string' ? payload.status : 'running',
          commandMarkdown: typeof payload.commandMarkdown === 'string' ? payload.commandMarkdown : '',
        });
        break;
      case 'error':
        errorMessage =
          typeof payload.message === 'string'
            ? payload.message
            : typeof payload.code === 'string'
              ? payload.code
              : 'The AI provider returned an error.';
        break;
      default:
        break;
    }
  }

  const resultMetadata = action.resultMetadata as Record<string, unknown> | null;
  const insufficient = resultMetadata?.insufficientEvidence === true || isLegacyInsufficientWikiAnswer(answer);

  return {
    status: mapConversationStatus(action.status),
    question,
    answer: insufficient ? '' : answer,
    thinking,
    citations,
    toolCalls,
    insufficient,
    errorMessage,
    queuedAt: action.queuedAt.toISOString(),
    startedAt: action.startedAt?.toISOString() ?? null,
    finishedAt: action.finishedAt?.toISOString() ?? null,
    eventCursor,
  };
}

function conversationTitle(question: string): string {
  const trimmed = question.trim();
  if (!trimmed) return 'Conversation';
  const excerpt = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  return `Conversation: ${excerpt}`;
}

/**
 * 025: filed under a per-channel subfolder (`conversations/{channel}/...`)
 * so Feishu and Wiki AI captures are visually distinguishable when browsing
 * the Raw space by path, without changing the shared "Conversation" raw
 * category (both channels stay one capability, per plan.md D2/D5 — this is
 * a folder-organization detail, not a second category or permission split).
 * Only chosen once, on first capture; later revisions reuse the page's
 * existing path (see writeConversationRevision), so this never touches
 * pages captured before the channel subfolder was introduced.
 */
function conversationPath(pathKey: string, queuedAt: Date, channel: WikiAiChannel): string {
  const year = queuedAt.getUTCFullYear();
  const month = String(queuedAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(queuedAt.getUTCDate()).padStart(2, '0');
  return `conversations/${channel}/${year}/${month}/${day}/${pathKey}`;
}

/** Human-readable Markdown transcript — the search/embedding surface for a
 * Conversation Raw revision. Deliberately excludes raw JSON so lexical and
 * vector search index meaningful content instead of structural noise. */
function appendTurnMarkdown(lines: string[], conversation: ReconstructedConversation, headingLevel: 1 | 3): void {
  const heading = '#'.repeat(headingLevel);
  lines.push(`${heading} Question`, '', conversation.question || '_No question was recorded._', '', `${heading} Answer`, '');

  if (conversation.insufficient) {
    lines.push('_No sources in the wiki support an answer to this question._');
  } else if (conversation.answer) {
    lines.push(conversation.answer);
  } else if (conversation.errorMessage) {
    lines.push(`_Error: ${conversation.errorMessage}_`);
  } else {
    lines.push('_The answer is not available yet._');
  }
  lines.push('');

  if (conversation.thinking) {
    lines.push(`${heading}# Thinking`, '', conversation.thinking, '');
  }
  if (conversation.citations.length > 0) {
    lines.push(`${heading}# Citations`, '');
    for (const citation of conversation.citations) lines.push(`- ${citation.title} (${citation.path})`);
    lines.push('');
  }
  if (conversation.toolCalls.length > 0) {
    lines.push(`${heading}# Tool Calls`, '');
    for (const call of conversation.toolCalls) {
      lines.push(`- ${call.toolName} (${call.status})`);
      if (call.commandMarkdown) lines.push('', call.commandMarkdown, '');
    }
  }
  lines.push(`Status: ${conversation.status}`);
}

function buildTranscriptText(conversation: ReconstructedConversation): string {
  const lines: string[] = [];
  appendTurnMarkdown(lines, conversation, 1);
  return lines.join('\n');
}

function buildSessionTranscriptText(turns: CapturedConversationTurn[]): string {
  if (turns.length === 1) return buildTranscriptText(turns[0]!.conversation);
  const lines: string[] = ['# Conversation', ''];
  turns.forEach((turn, index) => {
    lines.push(`## Turn ${index + 1}`, '');
    appendTurnMarkdown(lines, turn.conversation, 3);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

/** 025: which bot channel produced a captured turn, inferred once from the
 * underlying action's `requestMetadata.origin` (populated by the Feishu
 * delegation service as `'feishu'`, and implicitly `'web'`/absent for the web
 * chat side pane). Any other or missing origin resolves to `'wiki-ai'` — the
 * only two channels that exist today. */
export function resolveConversationChannel(requestMetadata: unknown): WikiAiChannel {
  const origin = (requestMetadata as { origin?: unknown } | null)?.origin;
  return origin === 'feishu' ? 'feishu' : 'wiki-ai';
}

function metadataString(requestMetadata: unknown, key: 'webSessionId' | 'feishuSessionId'): string | null {
  const value = (requestMetadata as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveConversationSessionKey(requestMetadata: unknown): ConversationSessionKey | null {
  const feishuSessionId = metadataString(requestMetadata, 'feishuSessionId');
  if (feishuSessionId) return { field: 'feishuSessionId', value: feishuSessionId };
  const webSessionId = metadataString(requestMetadata, 'webSessionId');
  if (webSessionId) return { field: 'webSessionId', value: webSessionId };
  return null;
}

async function lockConversationCaptureScope(
  tx: Tx,
  actionId: string,
  sessionKey: ConversationSessionKey | null,
): Promise<void> {
  if (!sessionKey) {
    await tx.execute(sql`select id from ai_actions where id = ${actionId} for update`);
    return;
  }
  if (sessionKey.field === 'webSessionId') {
    await tx.execute(sql`
      select id from ai_actions
      where feature in ('wiki_question', 'wiki_tool_chat')
        and request_metadata ->> 'webSessionId' = ${sessionKey.value}
      order by id
      for update
    `);
    return;
  }
  await tx.execute(sql`
    select id from ai_actions
    where feature in ('wiki_question', 'wiki_tool_chat')
      and request_metadata ->> 'feishuSessionId' = ${sessionKey.value}
    order by id
    for update
  `);
}

async function loadConversationSessionActions(
  tx: Tx,
  action: AiActionRow,
  sessionKey: ConversationSessionKey | null,
): Promise<AiActionRow[]> {
  if (!sessionKey) return [action];
  if (!action.actorUserId) return [action];
  const baseWhere =
    sessionKey.field === 'webSessionId'
      ? sql`${schema.aiActions.requestMetadata} ->> 'webSessionId' = ${sessionKey.value}`
      : sql`${schema.aiActions.requestMetadata} ->> 'feishuSessionId' = ${sessionKey.value}`;
  return tx
    .select()
    .from(schema.aiActions)
    .where(
      and(
        sql`${schema.aiActions.feature} in ('wiki_question', 'wiki_tool_chat')`,
        baseWhere,
        eq(schema.aiActions.actorUserId, action.actorUserId),
      ),
    )
    .orderBy(asc(schema.aiActions.queuedAt), asc(schema.aiActions.id));
}

async function findExistingConversationPageByPath(
  tx: Tx,
  spaceId: string,
  path: string,
): Promise<string | null> {
  const page = await tx.query.pages.findFirst({
    where: and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.path, path)),
    columns: { id: true },
  });
  return page?.id ?? null;
}

function buildSourceMetadata(
  actionId: string,
  questionMode: RawConversationSourceMetadata['questionMode'] | null,
  conversation: ReconstructedConversation,
  channel: WikiAiChannel,
  turns: ReconstructedConversation[],
): RawConversationSourceMetadata {
  return {
    inputKind: 'chat-transcript',
    sourceType: 'wiki-ai-conversation',
    schemaVersion: 1,
    actionId,
    eventCursor: conversation.eventCursor,
    conversationStatus: conversation.status,
    questionMode: questionMode ?? 'full',
    question: conversation.question,
    answer: conversation.answer,
    thinking: conversation.thinking,
    citations: conversation.citations,
    toolCalls: conversation.toolCalls,
    insufficient: conversation.insufficient,
    errorMessage: conversation.errorMessage,
    queuedAt: conversation.queuedAt,
    startedAt: conversation.startedAt,
    finishedAt: conversation.finishedAt,
    channel,
    turns: turns.map(toConversationSessionTurn),
  };
}

/** Ensures the built-in, protected Conversation raw category exists before
 * capture files anything under it. */
export async function ensureConversationCategory() {
  return ensureSystemCategory(CONVERSATION_CATEGORY_SYSTEM_KEY, {
    name: 'Conversation',
    slug: 'conversation',
    description: 'Captured Wiki AI conversations — the built-in Conversation category.',
  });
}

async function resolveRawSpace() {
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') {
    throw new DomainError('SPACE_UNAVAILABLE', 'Raw space is not available for conversation capture');
  }
  return space;
}

/**
 * Creates or appends the Raw Conversation page's revision, bypassing the
 * public raw-entries create/append helpers: those validate `source` against
 * the generic `RawSource` schema (channel/url/sessionId/…) and would silently
 * strip the richer structured conversation metadata this feature needs in
 * `source_metadata`. Capture is a trusted system path (no external ctx), so
 * it writes the revision directly, reusing the same low-level plumbing
 * (renderMarkdown, persistRevisionMetadata, syncRevisionAssetRefs,
 * addReplicationTasks) that the public helpers use.
 */
async function writeConversationRevision(
  tx: Tx,
  params: {
    existingPageId: string | null;
    spaceId: string;
    categoryId: string;
    authorId: string;
    path: string;
    title: string;
    contentSource: string;
    sourceMetadata: RawConversationSourceMetadata;
  },
): Promise<{ pageId: string }> {
  const { html, hash } = renderMarkdown(params.contentSource);

  let pageId = params.existingPageId;
  let versionNumber = 1;
  if (pageId) {
    const versionRows = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, pageId));
    versionNumber = (versionRows[0]?.value ?? 0) + 1;
  } else {
    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: params.spaceId,
        slug: params.path.split('/').pop() ?? params.path,
        path: params.path,
        title: params.title,
        authorId: params.authorId,
        nature: 'original',
        visibility: 'restricted',
        rawCategoryId: params.categoryId,
      })
      .returning({ id: schema.pages.id });
    if (!page) throw new Error('Failed to create Raw Conversation page');
    pageId = page.id;
  }

  const [revision] = await tx
    .insert(schema.pageRevisions)
    .values({
      pageId,
      versionNumber,
      contentType: 'text/markdown',
      contentSource: params.contentSource,
      contentHtml: html,
      contentHash: hash,
      authorId: params.authorId,
      status: 'published',
      actorKind: 'machine',
      sourceMetadata: params.sourceMetadata,
      publishedAt: new Date(),
    })
    .returning();
  if (!revision) throw new Error('Failed to write Raw Conversation revision');

  await persistRevisionMetadata(tx, {
    revisionId: revision.id,
    spaceId: params.spaceId,
    source: params.contentSource,
    fallbackTitle: params.title,
  });
  await syncRevisionAssetRefs(tx, revision.id, params.contentSource);
  await addReplicationTasks(tx, 'markdown', revision.id, hash);
  await tx
    .update(schema.pages)
    .set({ latestVersionId: revision.id, currentPublishedVersionId: revision.id, updatedAt: new Date() })
    .where(eq(schema.pages.id, pageId));

  return { pageId };
}

export type CaptureOutcome =
  | {
      status: 'captured';
      pageId: string;
      /** 025: the bot channel this turn was captured under — also the audit
       * origin signal (`'feishu'` maps to `audit_origin='feishu'`, anything
       * else maps to `'web'`). See D2/D4. */
      channel: WikiAiChannel;
      actorUserId: string;
      /** Non-secret Feishu correlation id carried from `requestMetadata`, if
       * any — never a raw prompt, answer, or credential. */
      correlationId: string | null;
    }
  | { status: 'skipped'; reason: 'not_eligible' | 'no_content' | 'already_current' }
  | { status: 'failed'; error: string };

/**
 * Idempotent, coalesced capture for one `wiki_question` action: reconstructs
 * the full conversation and creates or appends a Raw Conversation revision.
 * The whole decide-and-write path runs under one `FOR UPDATE` lock on the
 * action row so concurrent/duplicate queued jobs for the same action can
 * never create two pages (see contracts/api-delta.md "Capture Job Contract").
 */
export async function captureConversation(actionId: string): Promise<CaptureOutcome> {
  return runWithoutDataCache(() => captureConversationWithoutDataCache(actionId));
}

async function captureConversationWithoutDataCache(actionId: string): Promise<CaptureOutcome> {
  try {
    const outcome = await db.transaction(async (tx) => {
      // Read the row once to identify the conversation scope, then lock the
      // entire scope in a stable order. This prevents concurrent captures for
      // two turns in the same chat session from creating separate Raw pages.
      const initialAction = await tx.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
      if (!initialAction || !isCapturableFeature(initialAction.feature)) {
        return { status: 'skipped', reason: 'not_eligible' } as const;
      }
      const sessionKey = resolveConversationSessionKey(initialAction.requestMetadata);
      await lockConversationCaptureScope(tx, actionId, sessionKey);
      const action = await tx.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
      if (!action || !isCapturableFeature(action.feature)) {
        return { status: 'skipped', reason: 'not_eligible' } as const;
      }
      if (action.rawConversationCaptureStatus === 'disabled' || action.rawConversationCaptureStatus === 'not_applicable') {
        return { status: 'skipped', reason: 'not_eligible' } as const;
      }
      if (!action.actorUserId) {
        throw new DomainError('RAW_CONVERSATION_CAPTURE_FAILED', 'Conversation action has no attributable actor');
      }

      const conversation = await reconstructConversation(actionId, tx);
      if (!conversation || conversation.eventCursor === 0) {
        return { status: 'skipped', reason: 'no_content' } as const;
      }
      const sessionActions = await loadConversationSessionActions(tx, action, sessionKey);
      const eligibleSessionActions = sessionActions.filter(
        (row) =>
          row.rawConversationCaptureStatus !== 'disabled' &&
          row.rawConversationCaptureStatus !== 'not_applicable',
      );
      const turns: CapturedConversationTurn[] = [];
      for (const row of eligibleSessionActions) {
        const turn = await reconstructConversation(row.id, tx);
        if (turn && turn.eventCursor > 0) turns.push({ action: row, conversation: turn });
      }
      if (turns.length === 0) {
        return { status: 'skipped', reason: 'no_content' } as const;
      }
      const existingSessionPageId =
        turns.find((turn) => turn.action.rawConversationPageId)?.action.rawConversationPageId ??
        action.rawConversationPageId;
      const sessionAlreadyCurrent =
        Boolean(existingSessionPageId) &&
        turns.every(
          (turn) =>
            turn.action.rawConversationPageId === existingSessionPageId &&
            turn.conversation.eventCursor <= turn.action.rawConversationLastEventId,
        );
      if (sessionAlreadyCurrent) {
        return { status: 'skipped', reason: 'already_current' } as const;
      }

      const [space, category] = await Promise.all([resolveRawSpace(), ensureConversationCategory()]);
      const transcript = buildSessionTranscriptText(turns);
      const channel = resolveConversationChannel(action.requestMetadata);
      const sourceMetadata = buildSourceMetadata(
        actionId,
        action.questionMode,
        conversation,
        channel,
        turns.map((turn) => turn.conversation),
      );
      const firstTurn = turns[0]!;
      const pathKey = sessionKey?.value ?? actionId;
      const path = conversationPath(pathKey, firstTurn.action.queuedAt, channel);
      const title = conversationTitle(firstTurn.conversation.question);
      const existingPageId = existingSessionPageId ?? (await findExistingConversationPageByPath(tx, space.id, path));

      const { pageId } = await writeConversationRevision(tx, {
        existingPageId,
        spaceId: space.id,
        categoryId: category.id,
        authorId: action.actorUserId,
        path,
        title,
        contentSource: transcript,
        sourceMetadata,
      });

      for (const turn of turns) {
        await tx
          .update(schema.aiActions)
          .set({
            rawConversationPageId: pageId,
            rawConversationLastEventId: turn.conversation.eventCursor,
            rawConversationCaptureStatus: 'captured',
            rawConversationCaptureError: null,
          })
          .where(eq(schema.aiActions.id, turn.action.id));
      }

      const correlationId = (action.requestMetadata as { correlationId?: unknown } | null)?.correlationId;
      return {
        status: 'captured',
        pageId,
        authorId: action.actorUserId,
        channel,
        correlationId: typeof correlationId === 'string' ? correlationId : null,
      } as const;
    });

    if (outcome.status === 'captured') {
      await kickReplication();
      await reconcilePageAcrossIndexes(outcome.pageId, buildUserCtx(outcome.authorId, 'admin'));
      return {
        status: 'captured',
        pageId: outcome.pageId,
        channel: outcome.channel,
        actorUserId: outcome.authorId,
        correlationId: outcome.correlationId,
      };
    }
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Bounded, operator-only diagnostic — never shown to unauthorized users.
    await db
      .update(schema.aiActions)
      .set({ rawConversationCaptureStatus: 'failed', rawConversationCaptureError: message.slice(0, 2_000) })
      .where(eq(schema.aiActions.id, actionId));
    return { status: 'failed', error: message };
  }
}

/** Adapts a reconstructed conversation (or Raw revision metadata) into the
 * shared view model consumed by `ConversationSessionView`. */
export function toConversationSessionViewModel(conversation: ReconstructedConversation): ConversationSessionViewModel {
  return toConversationSessionTurn(conversation);
}

function toConversationSessionTurn(conversation: ReconstructedConversation): ConversationSessionTurn {
  return {
    status: conversation.status,
    question: conversation.question,
    answer: conversation.answer,
    thinking: conversation.thinking,
    citations: conversation.citations,
    toolCalls: conversation.toolCalls,
    insufficient: conversation.insufficient,
    errorMessage: conversation.errorMessage,
    queuedAt: conversation.queuedAt,
    startedAt: conversation.startedAt,
    finishedAt: conversation.finishedAt,
  };
}

/**
 * Reads the latest published revision of a captured Raw Conversation page and
 * returns it as a view model, for API/detail callers that want the persisted
 * (Raw-derived) snapshot rather than re-deriving it live from events. Returns
 * null if the page/revision is missing or its metadata does not validate —
 * callers should fall back to event-log detail rather than error.
 */
export async function getLatestConversationSnapshot(pageId: string): Promise<ConversationSessionViewModel | null> {
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  if (!page?.currentPublishedVersionId) return null;
  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, page.currentPublishedVersionId),
  });
  if (!revision) return null;
  const parsed = rawConversationSourceMetadataSchema.safeParse(revision.sourceMetadata);
  if (!parsed.success) return null;
  const snapshot = sourceMetadataToViewModel(parsed.data);
  if (snapshot.turns?.length) return snapshot;

  // Sessions captured before the complete-session snapshot was introduced
  // stored only the latest turn in source metadata. Rebuild the visible session
  // from its still-retained action events so those existing Raw pages do not
  // appear to have lost their earlier turns.
  const actions = await db
    .select({ id: schema.aiActions.id })
    .from(schema.aiActions)
    .where(eq(schema.aiActions.rawConversationPageId, pageId))
    .orderBy(asc(schema.aiActions.queuedAt), asc(schema.aiActions.id));
  const turns = (
    await Promise.all(actions.map(async (action) => reconstructConversation(action.id)))
  )
    .filter((turn): turn is ReconstructedConversation => Boolean(turn))
    .map(toConversationSessionTurn);

  return turns.length > 1 ? { ...snapshot, turns } : snapshot;
}

export function sourceMetadataToViewModel(metadata: RawConversationSourceMetadata): ConversationSessionViewModel {
  return {
    status: metadata.conversationStatus,
    question: metadata.question,
    answer: metadata.answer,
    thinking: metadata.thinking,
    citations: metadata.citations,
    toolCalls: metadata.toolCalls ?? [],
    insufficient: metadata.insufficient,
    errorMessage: metadata.errorMessage,
    queuedAt: metadata.queuedAt,
    startedAt: metadata.startedAt,
    finishedAt: metadata.finishedAt,
    ...(metadata.turns ? { turns: metadata.turns } : {}),
  };
}
