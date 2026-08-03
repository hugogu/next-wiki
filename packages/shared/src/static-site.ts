import { z } from 'zod';
import { gitRepositoryIdentity, gitBranchNameSchema, gitRemoteUrlSchema } from './content-storage';

// Static site publishing (031): a reader-facing HTML site of publicly readable
// pages, delivered to a static host.
//
// This is NOT Git export. Git export writes canonical raw Markdown as input for
// other tools; this writes rendered HTML as output for readers. They share a
// validation rule for Git remotes and nothing else — separate targets, separate
// triggers, separate state, separate history.
//
// Secrets are never part of these shapes: they are submitted through a
// write-only `secret` field and stored encrypted, and no view returns them.

/** Why a page was withheld from the published site. Counts only — a reason with
 *  a page attached would make run history a disclosure channel. */
export const staticSiteExclusionReasonSchema = z.enum([
  'not_published',
  'deleted',
  'restricted',
  'space_not_anonymous',
  'space_kind_raw',
  'space_kind_generated',
]);
export type StaticSiteExclusionReason = z.infer<typeof staticSiteExclusionReasonSchema>;

export const staticSitePublicationStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type StaticSitePublicationStatus = z.infer<typeof staticSitePublicationStatusSchema>;

export const staticSitePublicationTriggerSchema = z.enum([
  'manual',
  'content_change',
  'scheduled',
  'takedown',
]);
export type StaticSitePublicationTrigger = z.infer<typeof staticSitePublicationTriggerSchema>;

/**
 * The address the host will serve the site from. Its path component becomes the
 * artifact's base path, which is what makes project-site sub-path hosting work
 * (`https://owner.github.io/repo/` → `/repo/`). Getting this wrong breaks every
 * link on the site, so it is validated rather than inferred.
 */
export const staticSiteBaseUrlSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Use an absolute http(s) address, e.g. https://owner.github.io/repo/');

/** Normalize a base URL's path to leading-and-trailing-slash form: `/` for a
 *  domain root, `/repo/` for a sub-path. Shared by the generator and the UI so
 *  both compute the same base path from the same input. */
export function staticSiteBasePath(baseUrl: string): string {
  const { pathname } = new URL(baseUrl);
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/**
 * Where a published site is hosted.
 *
 * The artifact is deliberately host-neutral — plain files, no host-proprietary
 * constructs — so this is expected to grow. GitHub Pages is simply the first.
 */
export const staticSiteProviderSchema = z.enum(['github_pages']);
export type StaticSiteProvider = z.infer<typeof staticSiteProviderSchema>;

export const staticSiteTargetUpsertSchema = z.object({
  isEnabled: z.boolean(),
  provider: staticSiteProviderSchema.default('github_pages'),
  remoteUrl: gitRemoteUrlSchema,
  branch: gitBranchNameSchema,
  baseUrl: staticSiteBaseUrlSchema,
  autoPublishOnChange: z.boolean().default(false),
  scheduledPublishEnabled: z.boolean().default(false),
  scheduledIntervalMinutes: z.number().int().min(5).max(1440).default(60),
});
export type StaticSiteTargetUpsert = z.infer<typeof staticSiteTargetUpsertSchema>;
export type StaticSiteTargetUpsertInput = z.input<typeof staticSiteTargetUpsertSchema>;

export type StaticSiteExclusionCounts = Partial<Record<StaticSiteExclusionReason, number>>;

export type StaticSitePublicationView = {
  id: string;
  status: StaticSitePublicationStatus;
  trigger: StaticSitePublicationTrigger;
  startedAt: string | null;
  completedAt: string | null;
  pagesPublished: number;
  assetsPublished: number;
  pagesExcluded: number;
  exclusionsByReason: StaticSiteExclusionCounts;
  bytesTotal: number;
  commitSha: string | null;
  forcedPush: boolean;
  errorMessage: string | null;
};

/** What the admin surface returns. `hasSecret` stands in for the credential,
 *  which is never returned after being saved. */
export type StaticSiteTargetView = {
  id: string;
  isEnabled: boolean;
  remoteUrl: string;
  branch: string;
  baseUrl: string;
  provider: StaticSiteProvider;
  /** Credentials come from the shared integration, never from this record. */
  integrationId: string | null;
  autoPublishOnChange: boolean;
  scheduledPublishEnabled: boolean;
  scheduledIntervalMinutes: number;
  isStale: boolean;
  lastPublication: StaticSitePublicationView | null;
};

/** Pre-publish summary. Counts only, by design (see the exclusion reason note). */
export type StaticSiteEligibilitySummary = {
  publishable: number;
  excluded: number;
  exclusionsByReason: StaticSiteExclusionCounts;
};

/** Taking the site down is confirmed by typing the branch name, so a stray or
 *  replayed request cannot unpublish a site. */
export const staticSiteTakedownSchema = z.object({
  confirm: z.string().min(1),
});
export type StaticSiteTakedown = z.infer<typeof staticSiteTakedownSchema>;

export type StaticSitePublicationListResponse = {
  items: StaticSitePublicationView[];
};

export type StaticSiteValidationResult = {
  ok: boolean;
  /** Safe to display: never contains credential material. */
  message: string | null;
};


/**
 * The address GitHub Pages serves a repository from by default.
 *
 * `owner/owner.github.io` is a user or organization site served at the domain
 * root; anything else is a project site served under `/{repo}/`. Getting this
 * wrong is the single most common way to end up with a site whose every link
 * and stylesheet 404s, so it is derived rather than left to memory.
 *
 * Returns null when the remote is not a GitHub repository.
 */
export function githubPagesDefaultUrl(remoteUrl: string): string | null {
  const identity = gitRepositoryIdentity(remoteUrl);
  if (identity === null) return null;

  const [host, owner, repo] = identity.split('/');
  if (host !== 'github.com' || !owner || !repo) return null;

  return repo === `${owner}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repo}/`;
}

/**
 * The custom domain a published site should claim, or null when it is served
 * from the host's own domain.
 *
 * GitHub Pages reads this from a `CNAME` file in the served branch. Because a
 * publish replaces that branch wholesale, the file has to be part of the
 * artifact — otherwise the first publish silently clears a configured custom
 * domain.
 */
export function staticSiteCustomDomain(baseUrl: string): string | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  if (host === '' || host.endsWith('.github.io') || host === 'localhost') return null;
  return host;
}
