import { z } from 'zod';
import {
  publicPageSearchQuerySchema,
  type AiToolReviewDecision,
  type PublicPageInclude,
  type PublicPageResource,
} from '@next-wiki/shared';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import * as content from '@/server/services/public-content';
import * as tags from '@/server/services/tags';
import { auditImmediateToolMutation } from '@/server/services/audit';
import { createProposal } from '@/server/services/ai-tool-proposals';
import { getToolDefinition, type ToolDefinition } from '@/server/services/ai-tool-registry';

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
 * loop (T048). */
function toSafeFailure(error: unknown): ToolExecutionResult {
  if (error instanceof DomainError) {
    if (error.code === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'You do not have permission to perform that operation.');
    }
    return fail(error.code, error.message);
  }
  if (error instanceof z.ZodError) {
    return fail('BAD_REQUEST', 'The tool arguments were invalid.');
  }
  return fail('TOOL_FAILED', 'The tool could not complete.');
}

// ---- Argument schemas -------------------------------------------------------

const searchArgs = z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(MAX_LIST).optional() });
const pageRefArgs = z.object({ pageId: z.string().uuid().optional(), path: z.string().min(1).optional() }).refine((v) => v.pageId || v.path);
const listArgs = z
  .object({
    path: z.string().min(1).optional(),
    pathPrefix: z.string().min(1).optional(),
    space: z.enum(['wiki', 'raw', 'generated']).optional(),
    limit: z.number().int().min(1).max(MAX_LIST).optional(),
  })
  .strict();
const pageIdArgs = z.object({ pageId: z.string().uuid() });
const createPageArgs = z
  .object({
    path: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    contentSource: z.string().max(500_000).optional(),
    // Compatibility for models that use the public API's generic content
    // vocabulary despite the documented MCP argument name.
    content: z.string().max(500_000).optional(),
  })
  .transform(({ content, ...args }) => ({
    ...args,
    contentSource: args.contentSource ?? content ?? '',
  }));
const saveDraftArgs = z.object({ pageId: z.string().uuid(), title: z.string().min(1).max(200), contentSource: z.string().min(1).max(500_000) });
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

async function execGetPage(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = pageRefArgs.parse(rawArgs);
  const page = args.pageId
    ? await content.getPageById(ctx, args.pageId, READ_INCLUDE)
    : await content.getPageByPath(ctx, args.path!, READ_INCLUDE);
  if (!page) return fail('NOT_FOUND', 'No readable page matched. Use search_wiki or list_pages to discover an exact readable path.');
  return {
    ok: true,
    summary: `Read page "${page.title}".`,
    data: { ...pageCitationData(page), contentSource: page.contentSource ?? null },
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

async function execGetBacklinks(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = pageIdArgs.parse(rawArgs);
  const result = await content.getBacklinks(ctx, args.pageId);
  return { ok: true, summary: `${result.items.length} backlink(s) found.`, data: result };
}

async function execGetNeighborhood(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = pageIdArgs.parse(rawArgs);
  const result = await content.getNeighborhood(ctx, args.pageId, 1, 'both');
  return { ok: true, summary: 'Read page neighborhood.', data: result };
}

async function execListTags(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }).parse(rawArgs ?? {});
  const result = await tags.listTags(ctx, args);
  return { ok: true, summary: `${result.items?.length ?? 0} tag(s) listed.`, data: result };
}

// ---- Page-content write executors (drafts are the reviewable artifact) -------

async function execCreatePage(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = createPageArgs.parse(rawArgs);
  const page = await content.createPage(ctx, { path: args.path, title: args.title, contentSource: args.contentSource ?? '' });
  return { ok: true, summary: `Created draft page "${page.title}".`, draftPageId: page.id, data: { pageId: page.id, path: page.path } };
}

async function execSaveDraft(ctx: PermCtx, rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = saveDraftArgs.parse(rawArgs);
  const revision = await content.createDraft(ctx, args.pageId, { title: args.title, contentSource: args.contentSource });
  return { ok: true, summary: `Saved draft revision v${revision.version}.`, draftPageId: args.pageId, data: { pageId: args.pageId, version: revision.version } };
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

// ---- Dispatch ---------------------------------------------------------------

type Executor = (ctx: PermCtx, args: unknown, execCtx: ToolExecutionContext) => Promise<ToolExecutionResult>;

const EXECUTORS: Record<string, Executor> = {
  search_wiki: (ctx, args) => execSearchWiki(ctx, args),
  get_page: (ctx, args) => execGetPage(ctx, args),
  list_pages: (ctx, args) => execListPages(ctx, args),
  get_backlinks: (ctx, args) => execGetBacklinks(ctx, args),
  get_neighborhood: (ctx, args) => execGetNeighborhood(ctx, args),
  list_tags: (ctx, args) => execListTags(ctx, args),
  create_page: (ctx, args) => execCreatePage(ctx, args),
  save_draft: (ctx, args) => execSaveDraft(ctx, args),
  update_page_properties: execUpdatePageProperties,
  update_page_metadata: execUpdatePageMetadata,
  replace_page_tags: execReplacePageTags,
  create_tag: execCreateTag,
  rename_tag: execRenameTag,
  delete_tag: execDeleteTag,
  merge_tag: execMergeTag,
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
    return toSafeFailure(error);
  }
}

/** Resolve a tool definition + confirm an executor exists. */
export function resolveExecutableTool(toolName: string): ToolDefinition | null {
  const tool = getToolDefinition(toolName);
  if (!tool || !hasExecutor(toolName)) return null;
  return tool;
}
