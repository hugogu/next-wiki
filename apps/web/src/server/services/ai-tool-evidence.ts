import { eq } from 'drizzle-orm';
import { TOOL_EVIDENCE_RAW_SYSTEM_KEY } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { ensureSystemCategory, getCategoryBySystemKey } from '@/server/services/raw-categories';

type CategoryRow = typeof schema.rawCategories.$inferSelect;

/**
 * Tool Evidence Raw category primitives (026, R7). Tool output that becomes
 * source material for durable knowledge is captured or referenced as Raw
 * evidence filed under a protected system category. The category must always
 * be restorable so a durable AI-generated change is never left ungrounded; if
 * it cannot be made usable, callers block the durable change instead.
 *
 * This module owns lookup/restore only. Evidence capture, content hashing,
 * linking, and Raw-permission filtering are added in US5.
 */

const TOOL_EVIDENCE_DEFAULTS = {
  name: 'Tool Evidence',
  slug: 'tool-evidence',
  description: 'Tool output captured as source material for durable AI-generated knowledge.',
};

/** Read the Tool Evidence category without creating or restoring it. */
export async function getToolEvidenceCategory(): Promise<CategoryRow | undefined> {
  return getCategoryBySystemKey(TOOL_EVIDENCE_RAW_SYSTEM_KEY);
}

/**
 * Ensure the Tool Evidence category exists AND is usable for new evidence:
 * creates it on first use, and un-retires it if an admin had retired it, since
 * a retired category rejects new raw entries. Idempotent.
 */
export async function ensureToolEvidenceCategory(): Promise<CategoryRow> {
  const category = await ensureSystemCategory(TOOL_EVIDENCE_RAW_SYSTEM_KEY, TOOL_EVIDENCE_DEFAULTS);
  if (!category.isRetired) return category;
  const [restored] = await db
    .update(schema.rawCategories)
    .set({ isRetired: false, updatedAt: new Date() })
    .where(eq(schema.rawCategories.id, category.id))
    .returning();
  return restored ?? { ...category, isRetired: false };
}
