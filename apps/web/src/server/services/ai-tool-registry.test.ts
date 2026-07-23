import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PROVIDER,
  buildBuiltinToolMetadata,
  getToolDefinition,
  listToolDefinitions,
} from '@/server/services/ai-tool-registry';

describe('ai tool registry metadata (026, US6)', () => {
  it('identifies the built-in provider', () => {
    expect(BUILTIN_PROVIDER.key).toBe('next-wiki');
    expect(BUILTIN_PROVIDER.kind).toBe('builtin_wiki');
  });

  it('tags every tool with its provider identity and full contract', () => {
    const metadata = buildBuiltinToolMetadata();
    expect(metadata.provider).toEqual(BUILTIN_PROVIDER);
    expect(metadata.tools).toHaveLength(listToolDefinitions().length);
    for (const tool of metadata.tools) {
      expect(tool.providerKey).toBe('next-wiki');
      expect(tool.providerKind).toBe('builtin_wiki');
      // No field is implicit — the complete policy/risk/permission/retention
      // surface is present so an external provider is described the same way.
      expect(tool.name).toBeTruthy();
      expect(tool.category).toBeTruthy();
      expect(tool.riskLevel).toBeTruthy();
      expect(tool.requiredScope).toBeTruthy();
      expect(tool.resultRetention).toBeTruthy();
      expect(tool.defaultReviewPolicy).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('exposes only statically registered tools (no runtime discovery)', () => {
    const names = listToolDefinitions().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('search_wiki');
    expect(getToolDefinition('search_wiki')?.category).toBe('read');
    expect(getToolDefinition('not_a_real_tool')).toBeUndefined();
  });
});
