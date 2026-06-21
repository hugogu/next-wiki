import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx, can } from './index';

describe('AI permissions', () => {
  it('restricts administration to Admin sessions', () => {
    expect(can(buildUserCtx('a', 'admin'), 'manage_ai', { kind: 'ai_settings' })).toBe(true);
    expect(can(buildUserCtx('e', 'editor'), 'manage_ai', { kind: 'ai_settings' })).toBe(false);
    expect(can(buildApiKeyCtx('a', 'admin', ['run'], 'k'), 'manage_ai', { kind: 'ai_settings' })).toBe(false);
  });

  it('keeps mutation actions Editor/Admin-only and rejects anonymous/API keys', () => {
    expect(can(buildUserCtx('e', 'editor'), 'use_ai_text_optimization', { kind: 'ai_page' })).toBe(true);
    expect(can(buildUserCtx('r', 'reader'), 'use_ai_image_generation', { kind: 'ai_page' })).toBe(false);
    expect(can(buildAnonymousCtx(), 'use_ai_search', { kind: 'ai_index' })).toBe(false);
    expect(can(buildApiKeyCtx('e', 'editor', ['run'], 'k'), 'use_ai_qa', { kind: 'ai_page' })).toBe(false);
  });
});
