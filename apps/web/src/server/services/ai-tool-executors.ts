import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { diffArrays } from 'diff';
import {
  publicPageSearchQuerySchema,
  type AiToolReviewDecision,
  type PublicPageInclude,
  type PublicPageResource,
} from '@next-wiki/shared';
import { DomainError } from '@/server/errors';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getSpaceHref } from '@/lib/path';
import type { PermCtx } from '@/server/permissions';
import * as content from '@/server/services/public-content';
import * as tags from '@/server/services/tags';
import { auditImmediateToolMutation } from '@/server/services/audit';
import { createProposal } from '@/server/services/ai-tool-proposals';
import { getToolDefinition, type ToolDefinition } from '@/server/services/ai-tool-registry';
import { logger } from '@/server/logger';
import { findSkill, recordSkillUsage } from '@/server/services/skills/registry';
import { INSTRUCTION_FILE as SKILL_INSTRUCTION_FILE, safeRelativePath } from '@/server/services/skills/package';
import { createImageGeneration } from '@/server/services/ai-image-generation';
import { runInlineImageGenerationAction } from '@/server/services/ai-image-runner';
import { promoteGeneratedArtifact } from '@/server/services/ai-artifacts';
import { insertGeneratedImages } from '@/server/services/ai-generated-image-insertion';

/**
 * Built-in tool execution adapters (026, US2). Every adapter runs the operation
 * through an existing permission-checked service under the initiating user's
 * `PermCtx`, so a tool call can never exceed what the user could do directly.
 *
 * Read tools return a bounded, display-safe summary plus structured data fed
 * back to the model (never persisted wholesale). Page-content writes create a
 * draft revision — itself the reviewable artifact. Non-page mutations (tag,
 * metadata, batch) become a `ToolChangeProposal` when the effective review is
 * `admin_review`, and are applied immediately (with an audit record) only when
 * policy resolved to no review for this actor.
 */

export type ToolExecutionContext = {
  actorUserId: string | null;
  effectiveReview: AiToolReviewDecision;
  workflowId: string;
  toolCallId: string;
  actionId: string;
  conversation?: { question: string; answer: string }[];
  /** Characters of page or skill content one read may return. Set from the
   * admin-configured per-result cap, less the room the surrounding fields
   * need, so a read never reaches the runtime's generic truncator. */
  contentWindowChars?: number;
};

export type ToolExecutionResult = {
  ok: boolean;
  /** Bounded, permission-safe summary shown to the assistant and in events. */
  summary: string;
  /** Structured data returned to the model for reasoning; not persisted. */
  data?: unknown;
  proposalId?: string | null;
  draftPageId?: string | null;
  evidencePageId?: string | null;
  errorCode?: string;
  errorMessage?: string;
};

const MAX_LIST = 100;
const READ_INCLUDE: PublicPageInclude[] = ['publishedRevision'];

function fail(errorCode: string, errorMessage: string): ToolExecutionResult {
  return { ok: false, summary: errorMessage, errorCode, errorMessage };
}

/** Convert a thrown service error into a safe assistant-facing failure so a
 * denied permission or disabled category never leaks internals or crashes the
 * loop (T048). For ZodError, also emit a structured warning with the full
 * issue list and the caller's tool name so log-only debugging can attribute
 * "The tool arguments were invalid" responses back to the exact schema
 * mismatch that caused them. */
function toSafeFailure(error: unknown, context: { toolName: string; actionId?: string; workflowId?: string; toolCallId?: string; argumentKeys?: string[] }): ToolExecutionResult {
  if (error instanceof DomainError) {
    if (error.code === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'You do not have permission to perform that operation.');
    }
    return fail(error.code, error.message);
  }
  if (error instanceof z.ZodError) {
    // Capture the full Zod issue list so future "invalid tool call" failures
    // can be triaged from log alone: which field path failed, what the schema
    // rejected (code + message), and which tool the issue belongs to.
    // Argument values are intentionally NOT logged (assistant inputs may be
    // PII / long / sensitive); only the schema path and code leak.
    logger.warn('tool argument validation failed', {
      actionId: context.actionId,
      workflowId: context.workflowId,
      toolCallId: context.toolCallId,
      toolName: context.toolName,
      argumentKeys: context.argumentKeys,
      zodIssues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
    // Naming the offending arguments is what lets the model fix its next
    // attempt. Only field names and Zod's own messages are echoed — never a
    // submitted value, which could carry page content.
    const detail = error.issues
      .slice(0, 4)
      .map((issue) => {
        const field = issue.path.join('.');
        return field ? `${field}: ${issue.message}` : issue.message;
      })
      .join('; ');
    return fail(
      'BAD_REQUEST',
      detail
        ? `The tool arguments were invalid — ${detail}. Check the argument names and types for this tool and retry.`
        : 'The tool arguments were invalid. Check the argument names and types for this tool and retry.',
    );
  }
  logger.error('tool execution threw an unrecognized error', {
    actionId: context.actionId,
    workflowId: context.workflowId,
    toolCallId: context.toolCallId,
    toolName: context.toolName,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  return fail('TOOL_FAILED', 'The tool could not complete.');
}

// ---- Argument schemas -------------------------------------------------------

const searchArgs = z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(MAX_LIST).optional() });
const pageRefArgs = z
  .object({
    pageId: z.string().uuid().optional(),
    path: z.string().min(1).optional(),
    space: z.enum(['wiki', 'raw', 'generated']).optional(),
    contentOffset: z.number().int().min(0).optional(),
  })
  .refine((v) => v.pageId || v.path);
const listArgs = z
  .object({
    path: z.string().min(1).optional(),
    pathPrefix: z.string().min(1).optional(),
    space: z.enum(['wiki', 'raw', 'generated']).optional(),
    limit: z.number().int().min(1).max(MAX_LIST).optional(),
  })
  .strict();
const createPageArgs = z
  .object({
    path: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    contentSource: z.string().max(500_000).optional(),
    // Compatibility for models that use the public API's generic content
    // vocabulary despite the documented MCP argument name.
    content: z.string().max(500_000).optional(),
    contentFromConversation: z.boolean().optional(),
  })
  .transform(({ content, ...args }) => ({
    ...args,
    contentSource: args.contentSource ?? content ?? '',
  }));
const saveDraftArgs = z.object({
  pageId: z.string().uuid(),
  // A draft normally keeps the page's existing title. Requiring the model to
  // repeat it made an otherwise valid content revision fail for no benefit.
  title: z.string().min(1).max(200).optional(),
  contentSource: z.string().min(1).max(500_000).optional(),
  contentFromConversation: z.boolean().optional(),
}).refine((args) => args.contentFromConversation || args.contentSource, {
  message: 'Either contentSource or contentFromConversation is required.',
});
const propertiesArgs = z.object({ pageId: z.string().uuid(), title: z.string().min(1).max(200).optional(), path: z.string().min(1).max(200).optional() });
const metadataArgs = z.object({
  pageId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).nullable().optional(),
});
const replaceTagsArgs = z.object({ pageId: z.string().uuid(), tags: z.array(z.string().min(1).max(100)).max(50) });
const createTagArgs = z.object({ name: z.string().min(1).max(100) });
const renameTagArgs = z.object({ tagId: z.string().uuid(), name: z.string().min(1).max(100) });
const tagIdArgs = z.object({ tagId: z.string().uuid() });
const mergeTagArgs = z.object({ tagId: z.string().uuid(), targetTagId: z.string().uuid() });
const imageSourceArgs = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page') }),
  z.object({ kind: z.literal('selection'), text: z.string().min(1).max(100_000), hash: z.string().min(16).max(128) }),
]);
const generateImageArgs = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  source: imageSourceArgs,
  aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
});
const promoteGeneratedImageArgs = z.object({ artifactId: z.string().uuid(), pageId: z.string().uuid() });
const insertGeneratedImagesArgs = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  images: z.array(z.object({
    artifactId: z.string().uuid(),
    altText: z.string().trim().min(1).max(500),
  })).min(1).max(10),
});

// ---- Read executors ---------------------------------------------------------

function pageCitationData(page: PublicPageResource) {
  const revision = page.publishedRevision;
  return {
    pageId: page.id,
    path: page.path,
    title: page.title,
    locale: page.locale,
    spaceSlug: page.spaceSlug,
    revisionId: revision?.id ?? null,
    revisionHash: revision?.contentHash ?? null,
  };
}

async function execSearchWiki(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = searchArgs.parse(rawArgs);
  const query = publicPageSearchQuerySchema.parse({
    q: args.query,
    limit: args.limit ?? 10,
    include: READ_INCLUDE.join(','),
  });
  const result = await content.searchPages(ctx, query);
  const items = result.items
    .slice(0, MAX_LIST)
    .map((item) => pageCitationData(item.page));
  return { ok: true, summary: `${items.length} readable page(s) matched.`, data: { items } };
}

/**
 * A page path the model may have copied out of a reader URL.
 *
 * Read results carry a bare `path`, but `create_page` also returns an `href`
 * and the system prompt asks the model to reuse that href when it links to the
 * page — so `/spaces/generated/games/reversi` comes back as a `path` argument
 * sooner or later. Only a known reader space is stripped, and the literal path
 * is still tried first, so a real page that happens to live under `spaces/`
 * keeps winning.
 */
function readerUrlAsPageRef(path: string): { path: string; space: 'raw' | 'generated' | 'wiki' } | null {
  const match = /^\/?spaces\/(raw|generated|wiki)\/(.+)$/.exec(path.trim());
  return match ? { path: match[2]!, space: match[1] as 'raw' | 'generated' | 'wiki' } : null;
}

/**
 * Read a page by path in a chosen space, defaulting to the wiki space.
 *
 * Every read result already reports the `spaceSlug` a page lives in and
 * `create_page` writes into `generated`, so a path-addressed read that could
 * only ever see the wiki space left the model unable to re-read what it had
 * just found or created.
 */
async function readPageByPath(ctx: PermCtx, path: string, space?: string) {
  const direct = await content.getPageByPath(ctx, path, READ_INCLUDE, space);
  if (direct) return direct;
  const fromUrl = readerUrlAsPageRef(path);
  return fromUrl ? content.getPageByPath(ctx, fromUrl.path, READ_INCLUDE, fromUrl.space) : null;
}

/**
 * Markdown characters one `get_page` call returns.
 *
 * Kept under the runtime's `MAX_TOOL_RESULT_CHARS` with room for the
 * surrounding citation fields, so a page read never reaches the generic
 * truncator (a test pins the two together — importing the constant here would
 * close an import cycle). That truncator tells the model to "narrow the query
 * or read a
 * specific item instead" — advice a single-page read cannot act on, because
 * there is nothing narrower to ask for. A page longer than this window used to
 * be simply unreadable past its first slice: one conversation called get_page
 * 40 times on an 18k-character page, always receiving the same truncated head,
 * then rewrote the page from the 43% it could see and dropped the rest.
 */
const DEFAULT_PAGE_CONTENT_CHARS = 6_000;

/** Room reserved for a result's ids, path, title, hashes, and JSON envelope. */
const CONTENT_ENVELOPE_CHARS = 2_000;

/**
 * Content window that fits inside a per-result cap. The runtime passes the
 * result through `formatToolResultForModel`, so a read must leave room for the
 * fields wrapped around it or the generic truncator cuts the content back off.
 */
export function pageContentWindowFor(resultMaxChars: number): number {
  return Math.max(1_000, resultMaxChars - CONTENT_ENVELOPE_CHARS);
}

function contentWindow(execCtx?: ToolExecutionContext): number {
  const budget = execCtx?.contentWindowChars;
  return budget && budget > 0 ? Math.max(1_000, budget) : DEFAULT_PAGE_CONTENT_CHARS;
}

async function execGetPage(ctx: PermCtx, rawArgs: unknown, execCtx?: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = pageRefArgs.parse(rawArgs);
  const page = args.pageId
    ? await content.getPageById(ctx, args.pageId, READ_INCLUDE)
    : await readPageByPath(ctx, args.path!, args.space);
  if (!page) return fail('NOT_FOUND', 'No readable page matched. Use search_wiki or list_pages to discover an exact readable path.');

  const source = page.contentSource ?? null;
  if (source === null) {
    return { ok: true, summary: `Read page "${page.title}".`, data: { ...pageCitationData(page), contentSource: null } };
  }
  const contentLength = source.length;
  const offset = Math.min(args.contentOffset ?? 0, contentLength);
  const slice = source.slice(offset, offset + contentWindow(execCtx));
  const end = offset + slice.length;
  const hasMore = end < contentLength;
  return {
    ok: true,
    // The window is stated in the summary as well as the data because the
    // summary is what survives into the durable record and into a compacted
    // context — "I have the whole page" must never be the silent default.
    summary: hasMore
      ? `Read page "${page.title}" characters ${offset}-${end} of ${contentLength}. Call get_page again with contentOffset=${end} for the rest before rewriting it.`
      : `Read page "${page.title}"${offset > 0 ? ` characters ${offset}-${end} of ${contentLength} (end of page)` : ''}.`,
    data: {
      ...pageCitationData(page),
      contentSource: slice,
      contentOffset: offset,
      contentLength,
      hasMore,
      ...(hasMore ? { nextContentOffset: end } : {}),
    },
  };
}

async function execListPages(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = listArgs.parse(rawArgs ?? {});
  const pathPrefix = args.pathPrefix ?? args.path;
  const result = await content.listPages(ctx, {
    status: 'published',
    limit: args.limit ?? MAX_LIST,
    order: 'path',
    include: READ_INCLUDE,
    ...(pathPrefix ? { pathPrefix } : {}),
    ...(args.space && args.space !== 'wiki' ? { space: args.space } : {}),
  } as Parameters<typeof content.listPages>[1]);
  const items = result.items.slice(0, MAX_LIST).map((item) => pageCitationData(item));
  return { ok: true, summary: `${items.length} readable page(s) listed.`, data: { items } };
}

/**
 * Resolve a page reference that may be an id or a path.
 *
 * `get_page` has always accepted either, so a model that just read a page by
 * path reasonably expects its neighbours and backlinks to take the same
 * reference. Requiring a UUID here was an inconsistency the model could only
 * discover by failing.
 */
async function resolvePageId(
  ctx: PermCtx,
  args: { pageId?: string; path?: string; space?: string },
): Promise<string | null> {
  if (args.pageId) return args.pageId;
  if (!args.path) return null;
  const page = await readPageByPath(ctx, args.path, args.space);
  return page?.id ?? null;
}

async function execGetBacklinks(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = pageRefArgs.parse(rawArgs);
  const pageId = await resolvePageId(ctx, args);
  if (!pageId) return fail('NOT_FOUND', 'No readable page matched. Use search_wiki or list_pages to discover an exact readable path.');
  const result = await content.getBacklinks(ctx, pageId);
  return { ok: true, summary: `${result.items.length} backlink(s) found.`, data: result };
}

async function execGetNeighborhood(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = pageRefArgs.parse(rawArgs);
  const pageId = await resolvePageId(ctx, args);
  if (!pageId) return fail('NOT_FOUND', 'No readable page matched. Use search_wiki or list_pages to discover an exact readable path.');
  const result = await content.getNeighborhood(ctx, pageId, 1, 'both');
  return { ok: true, summary: 'Read page neighborhood.', data: result };
}

async function execListTags(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }).parse(rawArgs ?? {});
  const result = await tags.listTags(ctx, args);
  return { ok: true, summary: `${result.items?.length ?? 0} tag(s) listed.`, data: result };
}

// ---- Page-content write executors (drafts are the reviewable artifact) -------

function resolvePageContent(
  args: { contentSource?: string; contentFromConversation?: boolean },
  execCtx: ToolExecutionContext,
): string {
  if (!args.contentFromConversation) return args.contentSource ?? '';
  const conversation = execCtx.conversation ?? [];
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const answer = conversation[index]?.answer;
    if (answer?.trim()) return answer;
  }
  throw new DomainError('BAD_REQUEST', 'No previous assistant answer is available to save.');
}

/**
 * Recover unchanged lines that a model copied from a JSON-encoded get_page
 * result into a YAML literal block. JSON represents `\foo` as `\\foo`, while
 * YAML literal scalars preserve both slashes. We only restore a submitted line
 * when reducing each doubled slash makes the *entire* line equal its current
 * page counterpart, so intentional edits and genuine LaTex `\\` line breaks
 * remain untouched.
 */
export function restoreJsonEscapedBackslashes(currentSource: string, submittedSource: string): string {
  const currentLines = currentSource.split('\n');
  const submittedLines = submittedSource.split('\n');
  const restored = [...submittedLines];
  let currentIndex = 0;
  let submittedIndex = 0;

  const changes = diffArrays(currentLines, submittedLines, {
    comparator: (current, submitted) => current === submitted || current === undoJsonBackslashEscaping(submitted),
  });
  for (const change of changes) {
    const lines = change.value as string[];
    if (!change.added && !change.removed) {
      for (let index = 0; index < lines.length; index += 1) {
        const current = currentLines[currentIndex + index]!;
        const submitted = submittedLines[submittedIndex + index]!;
        if (current !== submitted && current === undoJsonBackslashEscaping(submitted)) {
          restored[submittedIndex + index] = current;
        }
      }
      currentIndex += lines.length;
      submittedIndex += lines.length;
    } else if (change.added) {
      submittedIndex += lines.length;
    } else {
      currentIndex += lines.length;
    }
  }
  return restored.join('\n');
}

function undoJsonBackslashEscaping(value: string): string {
  return value.replace(/\\\\/g, '\\');
}

async function execCreatePage(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = createPageArgs.parse(rawArgs);
  // AI-authored pages belong in the generated space, but only admins have write
  // access there (the generated space is admin-curated). Non-admin actors fall
  // back to the default (wiki) space so the operation doesn't 403.
  const isAdmin = ctx.actor.kind === 'user' && ctx.actor.role === 'admin';
  const page = await content.createPage(ctx, {
    path: args.path,
    title: args.title,
    contentSource: resolvePageContent(args, execCtx),
    nature: 'generated',
    space: isAdmin ? 'generated' : 'default',
  });
  return {
    ok: true,
    summary: `Created draft page "${page.title}".`,
    draftPageId: page.id,
    data: {
      pageId: page.id,
      path: page.path,
      title: page.title,
      // Reported alongside the href so a later path-addressed read has the
      // space to pass; without it the href is the only space-bearing handle
      // the model holds, and it ends up back here as a `path`.
      spaceSlug: page.spaceSlug,
      href: getSpaceHref(isAdmin ? 'generated' : 'wiki', page.path),
    },
  };
}

async function execSaveDraft(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = saveDraftArgs.parse(rawArgs);
  const page = await content.getPageById(ctx, args.pageId);
  if (!page) return fail('NOT_FOUND', 'No readable page matched.');
  const requestedSource = resolvePageContent(args, execCtx);
  const revision = await content.createDraft(ctx, args.pageId, {
    title: args.title ?? page.title,
    contentSource: restoreJsonEscapedBackslashes(page.contentSource ?? '', requestedSource),
  });
  return { ok: true, summary: `Saved draft revision v${revision.version}.`, draftPageId: args.pageId, data: { pageId: args.pageId, version: revision.version } };
}

// ---- Media executors --------------------------------------------------------

async function execGenerateImage(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = generateImageArgs.parse(rawArgs);
  try {
    // The surrounding Wiki AI question is already a pg-boss job. Creating the
    // child action with enqueue=false and running it here avoids a duplicate
    // worker job while preserving the normal child action/event lifecycle.
    const action = await createImageGeneration(ctx, args, { enqueue: false });
    await runInlineImageGenerationAction(action.id);
    const artifact = await db.query.aiGeneratedArtifacts.findFirst({
      where: eq(schema.aiGeneratedArtifacts.actionId, action.id),
    });
    if (!artifact) return fail('IMAGE_GENERATION_FAILED', 'Image generation did not produce an artifact.');
    return {
      ok: true,
      summary: 'Generated a private image artifact. Promote it before adding its Markdown to a draft.',
      data: {
        actionId: action.id,
        artifactId: artifact.id,
        contentType: artifact.contentType,
        sizeBytes: artifact.sizeBytes,
        expiresAt: artifact.expiresAt.toISOString(),
        previewUrl: `/api/ai/generated-artifacts/${artifact.id}`,
      },
    };
  } catch (error) {
    if (error instanceof DomainError && ['FORBIDDEN', 'BAD_REQUEST', 'NOT_FOUND', 'CANCELLED'].includes(error.code)) throw error;
    // Provider/error details may contain vendor diagnostics. The child action
    // retains governed diagnostics for administrators; the model sees only a
    // stable safe result.
    return fail('IMAGE_GENERATION_FAILED', 'Image generation failed.');
  }
}

async function execPromoteGeneratedImage(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = promoteGeneratedImageArgs.parse(rawArgs);
  try {
    const asset = await promoteGeneratedArtifact(ctx, args.artifactId, args.pageId);
    return {
      ok: true,
      summary: 'Promoted the generated image to a private Wiki asset. Use the returned Markdown in a separate draft save.',
      data: {
        assetId: asset.id,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        markdown: `![image](${asset.url})`,
      },
    };
  } catch (error) {
    if (error instanceof DomainError && ['FORBIDDEN', 'NOT_FOUND', 'CANCELLED'].includes(error.code)) throw error;
    return fail('ARTIFACT_NOT_PROMOTABLE', 'The generated image cannot be promoted.');
  }
}

async function execInsertGeneratedImages(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = insertGeneratedImagesArgs.parse(rawArgs);
  const result = await insertGeneratedImages(ctx, args);
  return {
    ok: true,
    summary: `Inserted ${result.assetIds.length} generated image(s) into draft revision v${result.version} without rewriting the page body.`,
    draftPageId: args.pageId,
    data: { pageId: args.pageId, version: result.version, assetIds: result.assetIds },
  };
}

// ---- Non-page write executors (proposal when review, else immediate) --------

async function proposeOrApply(
  execCtx: ToolExecutionContext,
  options: {
    kind: Parameters<typeof createProposal>[0]['kind'];
    title: string;
    rationale?: string;
    items: Parameters<typeof createProposal>[0]['items'];
    applyImmediately: () => Promise<string>;
    immediateTarget: string;
    toolName: string;
  },
): Promise<ToolExecutionResult> {
  if (execCtx.effectiveReview === 'admin_review') {
    const proposal = await createProposal({
      kind: options.kind,
      title: options.title,
      rationale: options.rationale,
      workflowId: execCtx.workflowId,
      toolCallId: execCtx.toolCallId,
      createdByActionId: execCtx.actionId,
      createdByUserId: execCtx.actorUserId,
      requestedReview: 'admin_review',
      effectiveReview: 'admin_review',
      items: options.items,
    });
    return { ok: true, summary: `${options.title} — created as a proposal for review.`, proposalId: proposal.id };
  }
  const summary = await options.applyImmediately();
  await auditImmediateToolMutation(execCtx.actorUserId, { toolName: options.toolName, target: options.immediateTarget });
  return { ok: true, summary };
}

async function execUpdatePageProperties(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = propertiesArgs.parse(rawArgs);
  return proposeOrApply(execCtx, {
    kind: 'metadata_update',
    title: `Update properties for page ${args.pageId}`,
    items: [{ resourceKind: 'page', resourceId: args.pageId, beforeState: {}, afterState: { title: args.title, path: args.path } }],
    immediateTarget: args.pageId,
    toolName: 'update_page_properties',
    applyImmediately: async () => {
      await content.updateProperties(ctx, args.pageId, { title: args.title, path: args.path });
      return `Updated properties for page ${args.pageId}.`;
    },
  });
}

async function execUpdatePageMetadata(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = metadataArgs.parse(rawArgs);
  const before = await content.getPageById(ctx, args.pageId, ['latestRevision']);
  if (!before) return fail('NOT_FOUND', 'No readable page matched.');
  return proposeOrApply(execCtx, {
    kind: 'metadata_update',
    title: `Update metadata for "${before.title}"`,
    items: [
      {
        resourceKind: 'page_metadata',
        resourceId: args.pageId,
        beforeState: { label: before.title, metadata: before.metadata ?? null },
        afterState: { date: args.date, summary: args.summary, tags: args.tags },
      },
    ],
    immediateTarget: args.pageId,
    toolName: 'update_page_metadata',
    applyImmediately: async () => {
      const baseRevisionId = before.latestRevision?.id;
      if (!baseRevisionId) throw new DomainError('NOT_FOUND', 'Page has no revision to update');
      await content.updatePageMetadata(ctx, args.pageId, {
        baseRevisionId,
        date: args.date,
        summary: args.summary,
        tags: args.tags,
      });
      return `Updated metadata for page ${args.pageId}.`;
    },
  });
}

async function execReplacePageTags(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = replaceTagsArgs.parse(rawArgs);
  const before = await content.getPageById(ctx, args.pageId);
  return proposeOrApply(execCtx, {
    kind: 'tag_update',
    title: `Retag "${before?.title ?? args.pageId}"`,
    items: [
      {
        resourceKind: 'page',
        resourceId: args.pageId,
        beforeState: { label: before?.title ?? null, tags: before?.metadata?.tags?.map((t) => t.name) ?? [] },
        afterState: { tags: args.tags },
      },
    ],
    immediateTarget: args.pageId,
    toolName: 'replace_page_tags',
    applyImmediately: async () => {
      await content.setPageTags(ctx, args.pageId, args.tags);
      return `Replaced tags on page ${args.pageId}.`;
    },
  });
}

async function execCreateTag(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = createTagArgs.parse(rawArgs);
  return proposeOrApply(execCtx, {
    kind: 'tag_update',
    title: `Create tag "${args.name}"`,
    items: [{ resourceKind: 'tag', beforeState: {}, afterState: { label: args.name, name: args.name } }],
    immediateTarget: args.name,
    toolName: 'create_tag',
    applyImmediately: async () => {
      await tags.createTag(ctx, args.name);
      return `Created tag "${args.name}".`;
    },
  });
}

async function execRenameTag(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = renameTagArgs.parse(rawArgs);
  return proposeOrApply(execCtx, {
    kind: 'tag_update',
    title: `Rename tag to "${args.name}"`,
    items: [{ resourceKind: 'tag', resourceId: args.tagId, beforeState: {}, afterState: { label: args.name, name: args.name } }],
    immediateTarget: args.tagId,
    toolName: 'rename_tag',
    applyImmediately: async () => {
      await tags.requestTagMutation(ctx, args.tagId, 'rename', args.name);
      return `Requested rename of tag ${args.tagId}.`;
    },
  });
}

async function execDeleteTag(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = tagIdArgs.parse(rawArgs);
  return proposeOrApply(execCtx, {
    kind: 'tag_update',
    title: `Retire tag ${args.tagId}`,
    items: [{ resourceKind: 'tag', resourceId: args.tagId, beforeState: { label: args.tagId }, afterState: { retired: true } }],
    immediateTarget: args.tagId,
    toolName: 'delete_tag',
    applyImmediately: async () => {
      await tags.requestTagMutation(ctx, args.tagId, 'delete');
      return `Requested retirement of tag ${args.tagId}.`;
    },
  });
}

async function execMergeTag(ctx: PermCtx, rawArgs: unknown, execCtx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = mergeTagArgs.parse(rawArgs);
  return proposeOrApply(execCtx, {
    kind: 'tag_update',
    title: `Merge tag ${args.tagId} into ${args.targetTagId}`,
    items: [{ resourceKind: 'tag', resourceId: args.tagId, beforeState: {}, afterState: { mergedInto: args.targetTagId } }],
    immediateTarget: args.tagId,
    toolName: 'merge_tag',
    applyImmediately: async () => {
      await tags.requestTagMerge(ctx, args.tagId, args.targetTagId);
      return `Requested merge of tag ${args.tagId}.`;
    },
  });
}

// ---- Skills (028) -----------------------------------------------------------

const loadSkillArgs = z.object({
  name: z.string().min(1).max(64),
  contentOffset: z.number().int().min(0).optional(),
});
const readSkillFileArgs = z.object({
  name: z.string().min(1).max(64),
  path: z.string().min(1).max(255),
  contentOffset: z.number().int().min(0).optional(),
});

/**
 * Load an enabled skill's instructions.
 *
 * There is no per-skill authorisation: any user with AI access may load any
 * enabled skill, because a skill confers no authority of its own. What the turn
 * may actually do is still decided by the user's permissions and the review
 * policy, so the safety boundary sits where it already was rather than being
 * duplicated here (FR-022a, FR-023).
 */
async function execLoadSkill(_ctx: PermCtx, rawArgs: unknown, execCtx?: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = loadSkillArgs.parse(rawArgs ?? {});
  const skill = await findSkill(args.name);
  if (!skill) return fail('SKILL_NOT_FOUND', `No skill named "${args.name}" is available.`);
  if (!skill.enabled) {
    // Deliberately the same message as "not found": whether a disabled skill
    // exists is not something a chat turn needs to reveal.
    return fail('SKILL_NOT_FOUND', `No skill named "${args.name}" is available.`);
  }
  const instructions = await skill.entry.readFile(SKILL_INSTRUCTION_FILE);
  if (instructions === null) {
    return fail('SKILL_INVALID', `The skill "${args.name}" has no readable instruction file.`);
  }
  await recordSkillUsage(skill.name);
  const bounded = boundSkillContent(instructions, args.contentOffset, contentWindow(execCtx));
  return {
    ok: true,
    summary: bounded.truncated
      ? `Loaded skill ${skill.name} characters ${bounded.contentOffset}-${bounded.nextContentOffset} of ${bounded.contentLength}. Call load_skill again with contentOffset=${bounded.nextContentOffset} for the rest.`
      : `Loaded skill ${skill.name}.`,
    data: {
      name: skill.name,
      description: skill.description,
      instructions: bounded.text,
      truncated: bounded.truncated,
      contentOffset: bounded.contentOffset,
      contentLength: bounded.contentLength,
      ...(bounded.nextContentOffset === undefined ? {} : { nextContentOffset: bounded.nextContentOffset }),
      // The file list travels with the instructions so the model knows what it
      // may read next without guessing at paths.
      files: skill.entry.files
        .filter((file) => file.path !== SKILL_INSTRUCTION_FILE)
        .map((file) => ({ path: file.path, kind: file.kind, viewable: file.viewable })),
    },
  };
}

/** Read one reference file inside a skill. Text only — nothing here executes. */
async function execReadSkillFile(_ctx: PermCtx, rawArgs: unknown, execCtx?: ToolExecutionContext): Promise<ToolExecutionResult> {
  const args = readSkillFileArgs.parse(rawArgs ?? {});
  const skill = await findSkill(args.name);
  if (!skill || !skill.enabled) {
    return fail('SKILL_NOT_FOUND', `No skill named "${args.name}" is available.`);
  }
  const relativePath = safeRelativePath(args.path);
  if (!relativePath) return fail('SKILL_PATH_INVALID', 'That skill file path is not valid.');
  const file = skill.entry.files.find((item) => item.path === relativePath);
  if (!file) return fail('SKILL_FILE_NOT_FOUND', `The skill has no file at "${relativePath}".`);
  if (!file.viewable) {
    return fail(
      'SKILL_FILE_NOT_VIEWABLE',
      `"${relativePath}" is binary or too large to read (${file.byteSize} bytes).`,
    );
  }
  const content = await skill.entry.readFile(relativePath);
  if (content === null) return fail('SKILL_FILE_NOT_FOUND', `The skill has no file at "${relativePath}".`);
  await recordSkillUsage(skill.name);
  const bounded = boundSkillContent(content, args.contentOffset, contentWindow(execCtx));
  return {
    ok: true,
    summary: bounded.truncated
      ? `Read ${relativePath} from skill ${skill.name} characters ${bounded.contentOffset}-${bounded.nextContentOffset} of ${bounded.contentLength}. Call again with contentOffset=${bounded.nextContentOffset} for the rest.`
      : `Read ${relativePath} from skill ${skill.name}.`,
    data: {
      name: skill.name,
      path: relativePath,
      contentType: file.contentType,
      content: bounded.text,
      truncated: bounded.truncated,
      contentOffset: bounded.contentOffset,
      contentLength: bounded.contentLength,
      ...(bounded.nextContentOffset === undefined ? {} : { nextContentOffset: bounded.nextContentOffset }),
      ...(file.kind === 'script'
        ? { note: 'This is reference material. The server does not execute skill scripts.' }
        : {}),
    },
  };
}

/**
 * Bound one piece of skill content, marking truncation in-band so the model can
 * tell "that is all" from "there was more" (FR-021).
 *
 * The window matches a page read for the same reason: anything larger reaches
 * the runtime's generic truncator, which chops the result without updating
 * `truncated` — so the payload went on claiming the file was complete while
 * most of it had been discarded. Total skill content across a turn is bounded
 * by the planner's transcript budget, like every other tool result.
 */
function boundSkillContent(
  content: string,
  offset = 0,
  windowChars = DEFAULT_PAGE_CONTENT_CHARS,
): { text: string; truncated: boolean; contentOffset: number; contentLength: number; nextContentOffset?: number } {
  const start = Math.min(offset, content.length);
  const slice = content.slice(start, start + windowChars);
  const end = start + slice.length;
  const hasMore = end < content.length;
  if (!hasMore) {
    return { text: slice, truncated: false, contentOffset: start, contentLength: content.length };
  }
  return {
    text: `${slice}\n\n[continues: characters ${end}-${content.length} not shown. Call again with contentOffset=${end}.]`,
    truncated: true,
    contentOffset: start,
    contentLength: content.length,
    nextContentOffset: end,
  };
}

// ---- Dispatch ---------------------------------------------------------------

type Executor = (ctx: PermCtx, args: unknown, execCtx: ToolExecutionContext) => Promise<ToolExecutionResult>;

const EXECUTORS: Record<string, Executor> = {
  search_wiki: (ctx, args) => execSearchWiki(ctx, args),
  get_page: execGetPage,
  list_pages: (ctx, args) => execListPages(ctx, args),
  get_backlinks: (ctx, args) => execGetBacklinks(ctx, args),
  get_neighborhood: (ctx, args) => execGetNeighborhood(ctx, args),
  list_tags: (ctx, args) => execListTags(ctx, args),
  create_page: execCreatePage,
  save_draft: execSaveDraft,
  update_page_properties: execUpdatePageProperties,
  update_page_metadata: execUpdatePageMetadata,
  replace_page_tags: execReplacePageTags,
  create_tag: execCreateTag,
  rename_tag: execRenameTag,
  delete_tag: execDeleteTag,
  merge_tag: execMergeTag,
  generate_image: (ctx, args) => execGenerateImage(ctx, args),
  promote_generated_image: (ctx, args) => execPromoteGeneratedImage(ctx, args),
  insert_generated_images: (ctx, args) => execInsertGeneratedImages(ctx, args),
  load_skill: execLoadSkill,
  read_skill_file: execReadSkillFile,
};

export function hasExecutor(toolName: string): boolean {
  return toolName in EXECUTORS;
}

/**
 * Execute one built-in tool. Any service error (permission denial, not found,
 * validation) is converted to a safe assistant-facing failure rather than
 * thrown, so the loop can report it and continue.
 */
export async function executeTool(
  ctx: PermCtx,
  tool: ToolDefinition,
  args: unknown,
  execCtx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const executor = EXECUTORS[tool.name];
  if (!executor) {
    return fail('TOOL_NOT_ENABLED', `The tool "${tool.name}" is not available in this phase.`);
  }
  try {
    return await executor(ctx, args, execCtx);
  } catch (error) {
    return toSafeFailure(error, {
      toolName: tool.name,
      actionId: execCtx.actionId,
      workflowId: execCtx.workflowId,
      toolCallId: execCtx.toolCallId,
      argumentKeys:
        args !== null && typeof args === 'object' && !Array.isArray(args)
          ? Object.keys(args)
          : undefined,
    });
  }
}

/** Resolve a tool definition + confirm an executor exists. */
export function resolveExecutableTool(toolName: string): ToolDefinition | null {
  const tool = getToolDefinition(toolName);
  if (!tool || !hasExecutor(toolName)) return null;
  return tool;
}
