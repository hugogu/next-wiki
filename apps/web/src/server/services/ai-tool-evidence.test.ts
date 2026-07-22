import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { ensureToolEvidenceCategory, getToolEvidenceCategory } from '@/server/services/ai-tool-evidence';

describe('ai tool evidence category (026)', () => {
  it('creates the protected Tool Evidence category on first use, idempotently', async () => {
    const first = await ensureToolEvidenceCategory();
    expect(first.systemKey).toBe('tool-evidence');
    expect(first.name).toBe('Tool Evidence');
    expect(first.isRetired).toBe(false);

    const second = await ensureToolEvidenceCategory();
    expect(second.id).toBe(first.id);
    expect(await getToolEvidenceCategory()).toBeDefined();
  });

  it('restores (un-retires) the category so evidence capture is never blocked by retirement', async () => {
    const category = await ensureToolEvidenceCategory();
    await db
      .update(schema.rawCategories)
      .set({ isRetired: true })
      .where(eq(schema.rawCategories.id, category.id));

    const restored = await ensureToolEvidenceCategory();
    expect(restored.id).toBe(category.id);
    expect(restored.isRetired).toBe(false);

    const reloaded = await db.query.rawCategories.findFirst({
      where: eq(schema.rawCategories.id, category.id),
    });
    expect(reloaded?.isRetired).toBe(false);
  });
});
