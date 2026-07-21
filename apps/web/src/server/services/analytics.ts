import { unstable_cache } from 'next/cache';
import type {
  AnalyticsProvider,
  AnalyticsProviderItem,
  AnalyticsSettingsView,
  UpdateAnalyticsSettingsInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { SITE_SHELL_CACHE_TAG, invalidateSiteShellCache, shouldUseDataCache } from '@/server/cache/public-cache';

type SettingsRow = typeof schema.analyticsProviderSettings.$inferSelect;

/**
 * A registered analytics provider. New providers are added by appending an
 * entry here (plus the mirrored `analyticsProviderSchema` value in
 * `@next-wiki/shared` and the DB `analyticsProviderEnum` value generated via
 * `pnpm db:generate`) — no page or layout code changes are required. See
 * `specs/024-analytics-integrations/contracts/script-injection.md`.
 *
 * `label`/`description`/`trackingIdFormatHint` are plain English strings —
 * they exist for API/MCP consumers and as a fallback for providers the admin
 * UI hasn't localized yet. The admin UI localizes known providers
 * client-side (see `AnalyticsProvidersForm`), mirroring
 * `ContentDataSourcesPanel`. This service must stay request-scope-free (no
 * `cookies()`/`headers()` reads) so it can be called from tests and any
 * future non-request context.
 */
export type AnalyticsProviderDefinition = {
  provider: AnalyticsProvider;
  label: string;
  description: string;
  trackingIdFormatHint: string;
  trackingIdPattern: RegExp;
  buildScriptContent: (trackingId: string) => string;
};

export const REGISTERED_ANALYTICS_PROVIDERS: AnalyticsProviderDefinition[] = [
  {
    provider: 'baidu_tongji',
    label: 'Baidu Tongji (百度统计)',
    description: "Baidu's web analytics service.",
    trackingIdFormatHint: '32-character hex string',
    trackingIdPattern: /^[a-f0-9]{32}$/i,
    buildScriptContent: (trackingId) => `
  var _hmt = _hmt || [];
  (function() {
    var hm = document.createElement("script");
    hm.src = "https://hm.baidu.com/hm.js?${trackingId}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(hm, s);
  })();`,
  },
  {
    provider: 'google_analytics',
    label: 'Google Analytics',
    description: "Google's web analytics service (GA4).",
    trackingIdFormatHint: 'G-XXXXXXXX (e.g. G-A1B2C3D4E5)',
    trackingIdPattern: /^G-[A-Z0-9]{6,12}$/,
    buildScriptContent: (trackingId) => `
  (function() {
    var gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src = "https://www.googletagmanager.com/gtag/js?id=${trackingId}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(gtagScript, s);
  })();
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${trackingId}');`,
  },
];

function findDefinition(provider: string): AnalyticsProviderDefinition | undefined {
  return REGISTERED_ANALYTICS_PROVIDERS.find((definition) => definition.provider === provider);
}

function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind === 'anonymous') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage analytics settings');
  }
  if (!can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage analytics settings');
  }
}

/** Builds the concatenated JavaScript body for every enabled, validly
 * configured provider, in registry order. Each provider's loader is wrapped
 * in its own try/catch so one provider's failure cannot block another's. */
export function buildActiveScriptContent(rows: readonly SettingsRow[]): string {
  const rowByProvider = new Map(rows.map((row) => [row.provider, row]));
  const blocks: string[] = [];
  for (const definition of REGISTERED_ANALYTICS_PROVIDERS) {
    const row = rowByProvider.get(definition.provider);
    if (!row?.enabled || !row.trackingId) continue;
    if (!definition.trackingIdPattern.test(row.trackingId)) {
      console.error(`Analytics provider "${definition.provider}" has an invalid stored Tracking ID; skipping script injection`);
      continue;
    }
    blocks.push(`try {\n${definition.buildScriptContent(row.trackingId)}\n} catch (e) {\n  console.error(e);\n}`);
  }
  return blocks.join('\n');
}

const getCachedActiveAnalyticsScriptContent = unstable_cache(
  async () => buildActiveScriptContent(await db.query.analyticsProviderSettings.findMany()),
  ['active-analytics-script-content'],
  { revalidate: 300, tags: [SITE_SHELL_CACHE_TAG] },
);

/** Resolves the active providers' script content for framework-level
 * injection into the root layout `<head>`. Depends only on admin-configured
 * state — never session/cookie/header — so it is safe on static/ISR pages. */
export async function getActiveAnalyticsScriptContent(): Promise<string> {
  if (shouldUseDataCache()) return getCachedActiveAnalyticsScriptContent();
  return buildActiveScriptContent(await db.query.analyticsProviderSettings.findMany());
}

function toItem(definition: AnalyticsProviderDefinition, row: SettingsRow | undefined): AnalyticsProviderItem {
  return {
    provider: definition.provider,
    label: definition.label,
    description: definition.description,
    enabled: row?.enabled ?? false,
    trackingId: row?.trackingId ?? null,
    trackingIdFormat: definition.trackingIdFormatHint,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** Merges the registry with stored rows; a missing row is treated as
 * disabled/no Tracking ID. Reused by `readAnalyticsSettings`,
 * `updateAnalyticsProvider`, and `upsertAnalyticsProviders`. Callers must
 * have already called `assertCanManage(ctx)` — this helper performs no
 * permission check of its own. */
async function listAnalyticsProviderItems(): Promise<AnalyticsProviderItem[]> {
  const rows = await db.query.analyticsProviderSettings.findMany();
  const rowByProvider = new Map(rows.map((row) => [row.provider, row]));
  return REGISTERED_ANALYTICS_PROVIDERS.map((definition) => toItem(definition, rowByProvider.get(definition.provider)));
}

/** Admin-only view of every registered provider plus the script content the
 * root layout will inline. Requires `manage_appearance`. */
export async function readAnalyticsSettings(ctx: PermCtx): Promise<AnalyticsSettingsView> {
  assertCanManage(ctx);
  return {
    providers: await listAnalyticsProviderItems(),
    activeScriptContent: await getActiveAnalyticsScriptContent(),
  };
}

type ProviderPatch = { enabled: boolean; trackingId: string | null };

/** Validates and upserts a single provider row. No permission check, no
 * cache invalidation — callers own both (so bulk updates invalidate once). */
async function upsertRow(provider: AnalyticsProvider, patch: ProviderPatch, updatedBy: string | null): Promise<SettingsRow> {
  const definition = findDefinition(provider);
  if (!definition) throw new DomainError('BAD_REQUEST', `Unknown analytics provider: ${provider}`);

  const trackingId = patch.trackingId?.trim() || null;
  if (patch.enabled && (!trackingId || !definition.trackingIdPattern.test(trackingId))) {
    throw new DomainError(
      'BAD_REQUEST',
      `Tracking ID for ${provider} must match the expected format: ${definition.trackingIdFormatHint}`,
    );
  }

  const values = { enabled: patch.enabled, trackingId, updatedBy, updatedAt: new Date() };
  const [row] = await db
    .insert(schema.analyticsProviderSettings)
    .values({ provider, ...values })
    .onConflictDoUpdate({ target: schema.analyticsProviderSettings.provider, set: values })
    .returning();
  if (!row) throw new Error('Failed to upsert analytics provider settings');
  return row;
}

/** Update a single provider's configuration. Requires `manage_appearance`. */
export async function updateAnalyticsProvider(
  ctx: PermCtx,
  provider: AnalyticsProvider,
  input: ProviderPatch,
): Promise<AnalyticsProviderItem> {
  assertCanManage(ctx);
  const row = await upsertRow(provider, input, getActorUserId(ctx));
  invalidateSiteShellCache();
  const definition = findDefinition(provider);
  if (!definition) throw new Error(`Unknown analytics provider: ${provider}`);
  return toItem(definition, row);
}

/** Bulk-upsert one or more providers. Each provider is validated and
 * upserted independently; the site-shell cache is invalidated once after
 * every row has been written. Requires `manage_appearance`. */
export async function upsertAnalyticsProviders(
  ctx: PermCtx,
  input: UpdateAnalyticsSettingsInput,
): Promise<AnalyticsSettingsView> {
  assertCanManage(ctx);
  const updatedBy = getActorUserId(ctx);
  for (const patch of input.providers) {
    await upsertRow(patch.provider, { enabled: patch.enabled, trackingId: patch.trackingId }, updatedBy);
  }
  invalidateSiteShellCache();
  return {
    providers: await listAnalyticsProviderItems(),
    activeScriptContent: await getActiveAnalyticsScriptContent(),
  };
}
