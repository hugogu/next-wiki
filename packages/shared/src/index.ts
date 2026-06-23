import { z } from 'zod';
import { userRoleSchema, userStatusSchema } from './auth';

export * from './auth';
export * from './pages';
export * from './api-keys';
export * from './user-center';
export * from './audit';
export * from './content-storage';
export * from './ai';
export * from './transfers';
export * from './appearance';
export * from './site';

// ---- Enums (mirror db/schema/enums.ts) -------------------------------------

export const revisionStatusSchema = z.enum(['draft', 'published']);
export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

export const contentTypeSchema = z.enum(['text/markdown']);
export type ContentType = z.infer<typeof contentTypeSchema>;

// ---- Shared view shapes (returned by services / tRPC) -----------------------

export const pageSummarySchema = z.object({
  path: z.string(),
  title: z.string(),
  authorDisplayName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

export const livePageSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  contentHtml: z.string(),
  contentHash: z.string(),
  version: z.number(),
  publishedAt: z.string().nullable(),
  authorDisplayName: z.string().nullable(),
  authorId: z.string(),
  status: revisionStatusSchema,
  createdAt: z.string(),
});
export type LivePage = z.infer<typeof livePageSchema>;

export const editableViewSchema = z.object({
  pageId: z.string().uuid(),
  revisionId: z.string().uuid(),
  path: z.string(),
  title: z.string(),
  contentSource: z.string(),
  latestVersion: z.number(),
  status: revisionStatusSchema,
  canPublish: z.boolean(),
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
});
export type UserView = z.infer<typeof userViewSchema>;
