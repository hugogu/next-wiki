import { describe, expect, it } from 'vitest';
import { buildUserCtx } from '@/server/permissions';
import { createLinkPage, retargetLinkPage } from './link-pages';

describe('link page retirement', () => {
  it('rejects creation and retargeting after the feature transition', async () => {
    const ctx = buildUserCtx('00000000-0000-0000-0000-000000000001', 'admin');
    await expect(createLinkPage(ctx, {
      path: 'legacy-link',
      targetPageId: '00000000-0000-0000-0000-000000000002',
    })).rejects.toMatchObject({ code: 'LINK_TARGET_INVALID' });
    await expect(retargetLinkPage(ctx, '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002')).rejects.toMatchObject({ code: 'LINK_TARGET_INVALID' });
  });
});
