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

  describe('ai.read scope (010-ai-curation-api)', () => {
    it('rejects use_ai_search for anonymous actors', () => {
      expect(can(buildAnonymousCtx(), 'use_ai_search', { kind: 'ai_index' })).toBe(false);
    });

    it('rejects use_ai_search for an api_key with no scopes', () => {
      expect(can(buildApiKeyCtx('r', 'reader', [], 'k'), 'use_ai_search', { kind: 'ai_index' })).toBe(false);
    });

    it("rejects use_ai_search for an api_key scoped only to 'view'", () => {
      expect(can(buildApiKeyCtx('r', 'reader', ['view'], 'k'), 'use_ai_search', { kind: 'ai_index' })).toBe(false);
    });

    it("allows use_ai_search for a reader api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('r', 'reader', ['ai.read'], 'k'), 'use_ai_search', { kind: 'ai_index' })).toBe(true);
    });

    it("allows use_ai_search for an editor api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('e', 'editor', ['ai.read'], 'k'), 'use_ai_search', { kind: 'ai_index' })).toBe(true);
    });

    it("allows use_ai_search for an admin api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('a', 'admin', ['ai.read'], 'k'), 'use_ai_search', { kind: 'ai_index' })).toBe(true);
    });

    it("allows use_ai_qa for a reader api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('r', 'reader', ['ai.read'], 'k'), 'use_ai_qa', { kind: 'ai_page' })).toBe(true);
    });

    it("still denies use_ai_text_optimization for an api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('r', 'reader', ['ai.read'], 'k'), 'use_ai_text_optimization', { kind: 'ai_page' })).toBe(false);
    });

    it("still denies manage_ai for an api_key with 'ai.read' scope", () => {
      expect(can(buildApiKeyCtx('r', 'reader', ['ai.read'], 'k'), 'manage_ai', { kind: 'ai_settings' })).toBe(false);
    });

    it('allows use_ai_search for a plain reader user session with no scopes', () => {
      expect(can(buildUserCtx('r', 'reader'), 'use_ai_search', { kind: 'ai_index' })).toBe(true);
    });
  });
});
