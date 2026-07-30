/**
 * MCP-compatible metadata for the built-in `next-wiki` Wiki AI tool provider
 * (026, US6). This mirrors the runtime registry in `apps/web` so an external
 * MCP consumer — or a future external MCP *provider* wired into the runtime —
 * aligns to the same tool vocabulary, categories, and risk classes.
 *
 * The names intentionally match the tools this MCP server registers; the
 * `tools/tools.test.ts` compatibility test guards that alignment. Runtime-only
 * tools without an MCP surface (e.g. tool-evidence capture) are excluded here.
 */

export const BUILTIN_TOOL_PROVIDER_KEY = 'next-wiki';

export type ToolCategory = 'read' | 'page_draft' | 'metadata' | 'tag' | 'batch' | 'raw_evidence' | 'media';
export type ToolRisk = 'read' | 'draft_write' | 'reviewed_write' | 'immediate_write';

export type BuiltinToolMetadata = {
  name: string;
  category: ToolCategory;
  risk: ToolRisk;
  description: string;
};

export const BUILTIN_TOOL_METADATA: readonly BuiltinToolMetadata[] = [
  { name: 'search_wiki', category: 'read', risk: 'read', description: description('search_wiki') },
  { name: 'get_page', category: 'read', risk: 'read', description: description('get_page') },
  { name: 'list_pages', category: 'read', risk: 'read', description: description('list_pages') },
  { name: 'get_backlinks', category: 'read', risk: 'read', description: description('get_backlinks') },
  { name: 'get_neighborhood', category: 'read', risk: 'read', description: description('get_neighborhood') },
  { name: 'list_tags', category: 'tag', risk: 'read', description: description('list_tags') },
  { name: 'create_page', category: 'page_draft', risk: 'draft_write', description: description('create_page') },
  { name: 'save_draft', category: 'page_draft', risk: 'draft_write', description: description('save_draft') },
  { name: 'update_page_properties', category: 'metadata', risk: 'reviewed_write', description: description('update_page_properties') },
  { name: 'update_page_metadata', category: 'metadata', risk: 'reviewed_write', description: description('update_page_metadata') },
  { name: 'create_tag', category: 'tag', risk: 'reviewed_write', description: description('create_tag') },
  { name: 'rename_tag', category: 'tag', risk: 'reviewed_write', description: description('rename_tag') },
  { name: 'delete_tag', category: 'tag', risk: 'reviewed_write', description: description('delete_tag') },
  { name: 'merge_tag', category: 'tag', risk: 'reviewed_write', description: description('merge_tag') },
  { name: 'batch_update_pages', category: 'batch', risk: 'reviewed_write', description: description('batch_update_pages') },
  { name: 'batch_soft_delete_pages', category: 'batch', risk: 'reviewed_write', description: description('batch_soft_delete_pages') },
  { name: 'generate_image', category: 'media', risk: 'immediate_write', description: description('generate_image') },
  { name: 'get_image_generation', category: 'media', risk: 'read', description: 'Poll a private generated-image action for safe status and artifact metadata.' },
  { name: 'promote_generated_image', category: 'media', risk: 'immediate_write', description: description('promote_generated_image') },
];

export function listBuiltinToolMetadata(): readonly BuiltinToolMetadata[] {
  return BUILTIN_TOOL_METADATA;
}

export function getBuiltinToolMetadata(name: string): BuiltinToolMetadata | undefined {
  return BUILTIN_TOOL_METADATA.find((tool) => tool.name === name);
}
import { getWikiMcpToolDescription as description } from '@next-wiki/shared';
