import { z } from 'zod';
import { userRoleSchema, userStatusSchema } from './auth';
import { pageVisibilitySchema } from './pages';

export * from './analytics';
export * from './auth';
export * from './pages';
export * from './api-keys';
export * from './user-center';
export * from './audit';
export * from './request-log';
export * from './content-storage';
export * from './ai';
export * from './ai-tools';
export * from './skills';
export * from './transfers';
export * from './translations';
export * from './user-appearance';
export * from './site';
export * from './system-theme';
export * from './search-settings';
export * from './feishu';
export * from './setup';
export * from './content-data-sources';
export * from './mcp-tool-catalog';
export * from './scheduled-ai-jobs';
export * from './integrations';
export * from './static-site';
export * from './page-migrations';

// ---- Enums (mirror db/schema/enums.ts) -------------------------------------

export const revisionStatusSchema = z.enum(['draft', 'published']);
export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

export const contentTypeSchema = z.enum(['text/markdown']);
export type ContentType = z.infer<typeof contentTypeSchema>;

// ---- Shared view shapes (returned by services / tRPC) -----------------------

export const pageSummarySchema = z.object({
  path: z.string(),
  // 035: canonical public address (see `livePageSchema.slug`). For a
  // translation summary this is the source page's slug, matching `path`'s
  // existing "shared across locale rows" convention.
  slug: z.string(),
  title: z.string(),
  authorDisplayName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  description: z.string().nullable().optional(),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

export const livePageSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  path: z.string(),
  // 035: the canonical public address this content resolves at — the page's
  // own `pages.slug` for an original page. A translation row owns no
  // independent slug, so a translation's `LivePage.slug` carries its
  // *source* page's slug instead (never the translation row's own empty
  // column); the reader route composes the final `{locale}/{slug}` address.
  slug: z.string(),
  title: z.string(),
  contentHtml: z.string(),
  contentHash: z.string(),
  version: z.number(),
  publishedAt: z.string().nullable(),
  authorDisplayName: z.string().nullable(),
  authorId: z.string(),
  visibility: pageVisibilitySchema,
  status: revisionStatusSchema,
  createdAt: z.string(),
  metadata: z.object({
    date: z.string().nullable(),
    summary: z.string().nullable(),
    tags: z.array(
      z.object({ id: z.string().uuid(), name: z.string(), normalizedName: z.string() }),
    ),
  }),
});
export type LivePage = z.infer<typeof livePageSchema>;

export const editableViewSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  path: z.string(),
  // 035: canonical public address — the editor's "view live page" action
  // navigates here, never to a path-built URL (tree moves don't change it).
  slug: z.string(),
  title: z.string(),
  contentSource: z.string(),
  latestVersion: z.number(),
  status: revisionStatusSchema,
  canPublish: z.boolean(),
  canDelete: z.boolean(),
  visibility: pageVisibilitySchema,
  writeMetadataToFrontmatter: z.boolean(),
  metadata: z.object({
    date: z.string().nullable(),
    summary: z.string().nullable(),
    tags: z.array(
      z.object({ id: z.string().uuid(), name: z.string(), normalizedName: z.string() }),
    ),
  }),
});
export type EditableView = z.infer<typeof editableViewSchema>;

export const revisionSummarySchema = z.object({
  version: z.number(),
  status: revisionStatusSchema,
  authorDisplayName: z.string().nullable(),
  createdAt: z.string(),
  contentHash: z.string(),
  canPublish: z.boolean(),
});
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;

export const revisionViewSchema = z.object({
  version: z.number(),
  status: revisionStatusSchema,
  contentHtml: z.string(),
  contentSource: z.string(),
  authorDisplayName: z.string().nullable(),
  createdAt: z.string(),
});
export type RevisionView = z.infer<typeof revisionViewSchema>;

export const userViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  displayName: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type UserView = z.infer<typeof userViewSchema>;
