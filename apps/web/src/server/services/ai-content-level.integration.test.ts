import { afterAll, describe, expect, it } from 'vitest';
import { publicPageSearchQuerySchema } from '@next-wiki/shared';
import { closeDb } from '@/server/db';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pages from './pages';
import * as content from './public-content';
import * as revisions from './revisions';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';

describe('page AI attribution and retrieval', () => {
  it('marks machine writes, downgrades after human editing, and filters independently before pagination', async () => {
    await ensurePublicApiDefaultSpace();
    const owner = await createPublicApiUser('ai-attribution@example.com', 'admin');
    const human = buildUserCtx(owner.id, 'admin');
    const machine = buildApiKeyCtx(owner.id, 'admin', ['view', 'create', 'edit'], 'ai-attribution-key');
    const makePage = async (path: string, ctx: typeof human | typeof machine) => {
      const page = await content.createPage(ctx, { path, title: 'attributiontoken', contentSource: '# attributiontoken' });
      await revisions.publish(human, { path, version: 1 });
      return page;
    };
    const original = await makePage('zz-attribution-human', human);
    const generated = await makePage('attribution-generated', machine);
    const assisted = await makePage('attribution-assisted', machine);
    expect(original.aiContentLevel).toBeNull();
    expect(generated.aiContentLevel).toBe('generated');
    // Publishing is not a human content edit.
    expect((await content.getPageById(human, generated.id))?.aiContentLevel).toBe('generated');
    await content.createDraft(human, assisted.id, { title: 'attributiontoken', contentSource: '# attributiontoken with human review' });
    expect((await content.getPageById(human, assisted.id))?.aiContentLevel).toBe('assisted');
    await revisions.publish(human, { path: assisted.path, version: 2 });
    await content.createDraft(machine, assisted.id, { title: 'attributiontoken', contentSource: '# attributiontoken subsequent AI edit' });
    expect((await content.getPageById(human, assisted.id))?.aiContentLevel).toBe('assisted');
    expect((await pages.getLive(human, assisted.path))?.aiContentLevel).toBe('assisted');
    expect((await pages.getLive(human, generated.path))?.aiContentLevel).toBe('generated');

    for (const order of ['relevance', 'createdAtAsc'] as const) {
      for (const [includeAiGenerated, includeAiAssisted, expected] of [
        [true, true, [original.id, generated.id, assisted.id]],
        [false, true, [original.id, assisted.id]],
        [true, false, [original.id, generated.id]],
        [false, false, [original.id]],
      ] as const) {
        const result = await content.searchPages(human, publicPageSearchQuerySchema.parse({
          q: 'attributiontoken', includeAiGenerated, includeAiAssisted, order,
        }));
        expect(result.items.map((item) => item.page.id).sort()).toEqual([...expected].sort());
      }
    }
    for (let index = 0; index < 22; index++) await makePage(`aa-attribution-generated-${index}`, machine);
    const filtered = await content.searchPages(human, publicPageSearchQuerySchema.parse({
      q: 'attributiontoken', includeAiGenerated: false, includeAiAssisted: false, limit: 1,
    }));
    expect(filtered.items.map((item) => item.page.id)).toEqual([original.id]);
    const page = await content.searchPages(human, publicPageSearchQuerySchema.parse({
      q: 'attributiontoken', includeAiGenerated: false, includeAiAssisted: false,
      order: 'createdAtAsc', limit: 1,
    }));
    expect(page.items.map((item) => item.page.id)).toEqual([original.id]);
    expect(page.nextCursor).toBeNull();
  });
});

afterAll(closeDb);
