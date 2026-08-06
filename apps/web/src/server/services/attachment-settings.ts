import { eq } from 'drizzle-orm';
import {
  DEFAULT_ATTACHMENT_ALLOWED_CATEGORIES,
  DEFAULT_ATTACHMENT_MAX_SIZE_BYTES,
  type AttachmentSettingsUpsert,
  type AttachmentSettingsView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertCanManageStorage } from './storage-config';

const SETTINGS_ID = 'default';

type AttachmentSettingsRow = typeof schema.attachmentSettings.$inferSelect;

async function getRow(): Promise<AttachmentSettingsRow | null> {
  return (
    (await db.query.attachmentSettings.findFirst({
      where: eq(schema.attachmentSettings.id, SETTINGS_ID),
    })) ?? null
  );
}

function toView(row: AttachmentSettingsRow | null): AttachmentSettingsView {
  return {
    maxSizeBytes: row?.maxSizeBytes ?? DEFAULT_ATTACHMENT_MAX_SIZE_BYTES,
    allowedCategories: (row?.allowedCategories ?? DEFAULT_ATTACHMENT_ALLOWED_CATEGORIES) as AttachmentSettingsView['allowedCategories'],
    updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
    updatedBy: row?.updatedBy ?? null,
  };
}

/** Wiki-wide attachment limits — the singleton row if configured, or the
 * schema defaults (20 MB / image+video+document) when no admin change has
 * ever been made. Read by every attach attempt (FR-008/FR-009/FR-010) and
 * never by a downstream read of an already-stored attachment (FR-012). */
export async function getAttachmentSettings(): Promise<AttachmentSettingsView> {
  return toView(await getRow());
}

/** Admin-only update. Never touches existing `content_assets`/
 * `page_attachments` rows — only new uploads are evaluated against the
 * updated configuration (FR-012/SC-005). */
export async function updateAttachmentSettings(
  ctx: PermCtx,
  input: AttachmentSettingsUpsert,
): Promise<AttachmentSettingsView> {
  assertCanManageStorage(ctx);
  if (!Number.isInteger(input.maxSizeBytes) || input.maxSizeBytes <= 0) {
    throw new DomainError('BAD_REQUEST', 'maxSizeBytes must be a positive integer');
  }
  if (input.allowedCategories.length === 0) {
    throw new DomainError('BAD_REQUEST', 'At least one allowed category is required');
  }
  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'api_key' ? ctx.actor.userId : null;

  const [row] = await db
    .insert(schema.attachmentSettings)
    .values({
      id: SETTINGS_ID,
      maxSizeBytes: input.maxSizeBytes,
      allowedCategories: input.allowedCategories,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.attachmentSettings.id,
      set: {
        maxSizeBytes: input.maxSizeBytes,
        allowedCategories: input.allowedCategories,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return toView(row!);
}
