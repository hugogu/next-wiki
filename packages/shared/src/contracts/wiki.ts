import { z } from "zod";
import { localeSchema, paginationSchema, sortDirectionSchema } from "./common";

// ── Spaces ────────────────────────────────────────────────────────────────────

export const spaceSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, "Key must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  defaultLocale: localeSchema,
  isPublicByDefault: z.boolean().default(false),
  navigationMode: z.enum(["tree", "flat"]).default("tree"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createSpaceSchema = spaceSchema.pick({
  key: true,
  name: true,
  description: true,
  defaultLocale: true,
  isPublicByDefault: true,
  navigationMode: true,
});

export const updateSpaceSchema = createSpaceSchema.partial();

// ── Pages ─────────────────────────────────────────────────────────────────────

export const pageStatusSchema = z.enum(["draft", "published", "archived", "deleted"]);

export const pageSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  spaceKey: z.string(),
  translationGroupId: z.string().uuid().optional(),
  path: z.string().min(1).startsWith("/"),
  locale: localeSchema,
  title: z.string().min(1).max(500),
  summary: z.string().max(1000).optional(),
  status: pageStatusSchema,
  currentRevisionId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});

export const createPageSchema = z.object({
  spaceKey: z.string(),
  path: z.string().min(1).startsWith("/"),
  locale: localeSchema,
  title: z.string().min(1).max(500),
  summary: z.string().max(1000).optional(),
  sourceContent: z.string(),
  sourceFormat: z.string().default("markdown"),
  changeSummary: z.string().max(500).optional(),
  tagSlugs: z.array(z.string()).default([]),
  translationGroupId: z.string().uuid().optional(),
});

export const updatePageSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(1000).optional(),
  sourceContent: z.string().optional(),
  sourceFormat: z.string().optional(),
  changeSummary: z.string().max(500).optional(),
  tagSlugs: z.array(z.string()).optional(),
  status: pageStatusSchema.optional(),
});

export const movePageSchema = z.object({
  targetPath: z.string().min(1).startsWith("/"),
  targetSpaceKey: z.string().optional(),
});

// ── Page Revisions ────────────────────────────────────────────────────────────

export const pageRevisionSchema = z.object({
  id: z.string().uuid(),
  pageId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  title: z.string(),
  sourceFormat: z.string(),
  sourceContent: z.string(),
  contentHash: z.string(),
  changeSummary: z.string().optional(),
  authoredByUserId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});

// ── Tags ──────────────────────────────────────────────────────────────────────

export const tagSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  colorToken: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTagSchema = tagSchema.pick({
  slug: true,
  label: true,
  description: true,
  colorToken: true,
});

export const updateTagSchema = createTagSchema.partial();

// ── Search ────────────────────────────────────────────────────────────────────

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  spaceKey: z.string().optional(),
  locale: localeSchema.optional(),
  tagSlugs: z.array(z.string()).default([]),
  ...paginationSchema.shape,
  sort: z.enum(["relevance", "updatedAt", "createdAt"]).default("relevance"),
  sortDir: sortDirectionSchema,
});

export const searchResultItemSchema = z.object({
  page: pageSchema,
  excerpt: z.string(),
  rank: z.number(),
  matchedTags: z.array(tagSchema),
});

// ── Assets ────────────────────────────────────────────────────────────────────

export const assetSchema = z.object({
  id: z.string().uuid(),
  storageKind: z.enum(["local", "object"]),
  path: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int(),
  kind: z.enum(["image", "document", "diagram-source", "theme-asset", "other"]),
  uploadedByUserId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  url: z.string().optional(),
});

// ── Permissions ───────────────────────────────────────────────────────────────

export const permissionActionSchema = z.enum(["read", "write", "delete", "manage", "execute"]);
export const permissionEffectSchema = z.enum(["allow", "deny"]);
export const resourceTypeSchema = z.enum(["site", "space", "page", "asset", "ai", "integration"]);

export const permissionRuleSchema = z.object({
  id: z.string().uuid(),
  subjectType: z.enum(["user", "group"]),
  subjectId: z.string().uuid(),
  resourceType: resourceTypeSchema,
  resourceId: z.string().uuid().optional(),
  action: permissionActionSchema,
  effect: permissionEffectSchema,
  createdAt: z.string().datetime(),
});

export const createPermissionRuleSchema = permissionRuleSchema.omit({
  id: true,
  createdAt: true,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type Space = z.infer<typeof spaceSchema>;
export type Page = z.infer<typeof pageSchema>;
export type PageRevision = z.infer<typeof pageRevisionSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type PermissionRule = z.infer<typeof permissionRuleSchema>;
export type PermissionAction = z.infer<typeof permissionActionSchema>;
