import { eq } from 'drizzle-orm';
import type { SiteSettingsView, UpdateSiteSettingsInput } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const SETTINGS_ID = 'default';
const ICON_ROUTE = '/api/settings/site/icon';

export const DEFAULT_SITE_NAME = 'next-wiki';
export const DEFAULT_ICP_URL = 'https://beian.miit.gov.cn/';
export const DEFAULT_PUBLIC_SECURITY_URL = 'https://beian.mps.gov.cn/';

function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage site settings');
  }
}

const ALLOWED_ICON_MIME = new Set([
  'image/svg+xml',
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
const MAX_ICON_BYTES = 512 * 1024;

type SiteRow = typeof schema.siteSettings.$inferSelect;

async function getRow(): Promise<SiteRow | null> {
  return (
    (await db.query.siteSettings.findFirst({ where: eq(schema.siteSettings.id, SETTINGS_ID) })) ?? null
  );
}

function toView(row: SiteRow | null): SiteSettingsView {
  const icpNumber = row?.icpNumber ?? null;
  const psNumber = row?.publicSecurityNumber ?? null;
  return {
    siteName: row?.siteName ?? DEFAULT_SITE_NAME,
    iconUrl: ICON_ROUTE,
    hasCustomIcon: Boolean(row?.iconData),
    footerCopyright: row?.footerCopyright ?? null,
    icp: {
      number: icpNumber,
      url: icpNumber ? row?.icpUrl ?? DEFAULT_ICP_URL : null,
    },
    publicSecurity: {
      number: psNumber,
      url: psNumber ? row?.publicSecurityUrl ?? DEFAULT_PUBLIC_SECURITY_URL : null,
    },
  };
}

/** Public-readable view used by the header, footer, and metadata. */
export async function getSiteView(): Promise<SiteSettingsView> {
  return toView(await getRow());
}

/** Lightweight name accessor for metadata. */
export async function getSiteName(): Promise<string> {
  return (await getRow())?.siteName ?? DEFAULT_SITE_NAME;
}

/** Replace site identity/footer fields (icon handled separately). */
export async function updateSiteSettings(
  ctx: PermCtx,
  input: UpdateSiteSettingsInput,
): Promise<SiteSettingsView> {
  assertCanManage(ctx);
  const values = {
    siteName: input.siteName,
    footerCopyright: input.footerCopyright ?? null,
    icpNumber: input.icpNumber ?? null,
    icpUrl: input.icpUrl ?? null,
    publicSecurityNumber: input.publicSecurityNumber ?? null,
    publicSecurityUrl: input.publicSecurityUrl ?? null,
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.siteSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: schema.siteSettings.id, set: values });
  return toView(await getRow());
}

/** Returns the stored custom icon, or null when the default should be served. */
export async function getIcon(): Promise<{ data: Buffer; mime: string } | null> {
  const row = await getRow();
  if (!row?.iconData || !row.iconMime) return null;
  return { data: row.iconData, mime: row.iconMime };
}

/** Store a custom site icon. Requires manage_appearance. */
export async function setIcon(ctx: PermCtx, bytes: Buffer, mime: string): Promise<void> {
  assertCanManage(ctx);
  if (!ALLOWED_ICON_MIME.has(mime)) {
    throw new DomainError('BAD_REQUEST', 'Icon must be an SVG, PNG, or ICO image');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) {
    throw new DomainError('BAD_REQUEST', 'Icon must be between 1 byte and 512 KB');
  }
  const values = {
    iconData: bytes,
    iconMime: mime,
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.siteSettings)
    .values({ id: SETTINGS_ID, siteName: DEFAULT_SITE_NAME, ...values })
    .onConflictDoUpdate({ target: schema.siteSettings.id, set: values });
}

/** Clear the custom icon, reverting to the shipped default. Requires manage_appearance. */
export async function clearIcon(ctx: PermCtx): Promise<void> {
  assertCanManage(ctx);
  await db
    .update(schema.siteSettings)
    .set({ iconData: null, iconMime: null, updatedBy: getActorUserId(ctx), updatedAt: new Date() })
    .where(eq(schema.siteSettings.id, SETTINGS_ID));
}
